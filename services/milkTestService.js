
const MilkTestSession = require("../models/MilkTestSession");
const MilkTestReading = require("../models/MilkTestReading");
const MilkPrediction = require("../models/MilkPrediction");

const {
    publishMode,
    publishEnable,
    getMQTTStatus,
    mqttEvents
} = require("./milkTestMqttService");

const {
    predictAdulteration
} = require("../ml/adulterationPredictionService");

const {
    predictMilkAnalysis
} = require("../ml/milkAnalysisPredictionService");

// Shared device topic root
const DEVICE_ID =
    process.env.MQTT_TOPIC_ROOT || "san-milk-a84f29/01";

const ACTIVE_STATUSES = [
    "STARTING",
    "RUNNING",
    "STOPPING",
    "PROCESSING"
];

let activeSession = null;

let latestDeviceStatus = {
    status: "unknown",
    farmerCustomId: null,
    lastSeen: null
};

let listenersRegistered = false;

// ============================================
// SERIALIZE START / STOP OPERATIONS
// ============================================

let operationQueue = Promise.resolve();

function runExclusive(operation) {
    const result = operationQueue.then(operation);

    operationQueue = result.catch(error => {
        console.error("Milk test operation queue error:", error);
    });

    return result;
}

// ============================================
// SERIALIZE SENSOR READING DATABASE WRITES
// ============================================

let readingQueue = Promise.resolve();
let readingSaveErrors = [];

function queueReading(operation) {
    const result = readingQueue.then(operation);

    readingQueue = result.catch(error => {
        readingSaveErrors.push(error);

        console.error(
            "Milk reading queue error:",
            error
        );
    });

    return result;
}

// ============================================
// REGISTER MQTT LISTENERS
// ============================================

function registerMQTTListeners() {
    if (listenersRegistered) return;

    listenersRegistered = true;

    mqttEvents.on("deviceStatus", handleDeviceStatus);

    mqttEvents.on("spectrum", handleSpectrum);

    mqttEvents.on("mqttError", error => {
        console.error("Milk Test MQTT Error:", error);
    });

    console.log("Milk Test MQTT listeners registered.");
}

// ============================================
// DEVICE STATUS
// ============================================

function handleDeviceStatus(data) {
    const farmerCustomId =
        data?.farmerCustomId || null;

    const status = String(
        data?.status || data || "unknown"
    ).toLowerCase();

    latestDeviceStatus = {
        status,
        farmerCustomId,
        lastSeen: new Date()
    };

    console.log(
        "Milk Analyzer Device Status:",
        latestDeviceStatus
    );
}

// ============================================
// RECEIVE SPECTRAL READINGS
// ============================================

function handleSpectrum(data) {
    if (!activeSession) {
        console.warn(
            "Spectral data received without an active test."
        );
        return;
    }

    const session = activeSession;

    // Compare using the custom farmer ID from MQTT topic.
    const farmerCustomId = String(
        data?.farmerCustomId || ""
    );

    if (
        farmerCustomId !==
        String(session.farmerCustomId)
    ) {
        console.warn(
            "Ignoring spectral data from an unexpected farmer topic."
        );
        return;
    }

    // Accept readings only while collection is active.
    if (!["STARTING", "RUNNING"].includes(session.status)) {
        return;
    }

    const spectralValues = data?.spectralValues;

    if (
        !Array.isArray(spectralValues) ||
        spectralValues.length !== 18 ||
        spectralValues.some(value =>
            typeof value !== "number" ||
            !Number.isFinite(value)
        )
    ) {
        console.error("Invalid spectral data received.");
        return;
    }

    queueReading(async () => {
        const currentSession =
            await MilkTestSession.findById(session._id);

        if (
            !currentSession ||
            !ACTIVE_STATUSES.includes(currentSession.status)
        ) {
            return;
        }

        const sequenceNumber =
            currentSession.totalReadings + 1;

        // Keep MongoDB ObjectId for database relationships.
        await MilkTestReading.create({
            testId: currentSession._id,
            farmerId: currentSession.farmerId,
            deviceId: currentSession.deviceId,
            sequenceNumber,
            spectralValues,
            measuredAt: new Date(),
            sourceTopic: data.topic || ""
        });

        const nextStatus =
            currentSession.status === "STARTING"
                ? "RUNNING"
                : currentSession.status;

        await MilkTestSession.findByIdAndUpdate(
            currentSession._id,
            {
                $set: {
                    status: nextStatus,
                    startedAt:
                        currentSession.startedAt || new Date()
                },
                $inc: {
                    totalReadings: 1
                }
            }
        );

        console.log(
            `Milk reading saved: ${sequenceNumber}, Test: ${session._id}`
        );

    }).catch(error => {
        console.error(
            "Failed to save milk spectral reading:",
            error
        );
    });
}

// ============================================
// SAVE PREDICTION IN MONGODB
// ============================================

async function saveMilkPrediction(predictionData) {
    let prediction = await MilkPrediction.findOne({
        testId: predictionData.testId
    });

    if (!prediction) {
        prediction = new MilkPrediction(predictionData);
    } else {
        Object.assign(prediction, predictionData);
    }

    await prediction.save();

    return prediction;
}

// ============================================
// MODE 0 - ADULTERATION PREDICTION
// ============================================

async function createAdulterationResult(readings) {
    const results = [];

    for (const reading of readings) {
        const result = await predictAdulteration(
            reading.spectralValues
        );

        if (
            !result?.success ||
            !result.prediction ||
            !result.probabilities
        ) {
            throw new Error(
                "Invalid adulteration model prediction result."
            );
        }

        results.push(result);
    }

    if (!results.length) {
        throw new Error(
            "No adulteration predictions were generated."
        );
    }

    const classKeys = Object.keys(
        results[0].probabilities
    );

    if (!classKeys.length) {
        throw new Error(
            "Adulteration model returned no class probabilities."
        );
    }

    // Average class probabilities across all readings.
    const averagedProbabilities = {};

    for (const key of classKeys) {
        let total = 0;

        for (const result of results) {
            const probability =
                result.probabilities[key]?.probability;

            if (
                typeof probability !== "number" ||
                !Number.isFinite(probability) ||
                probability < 0 ||
                probability > 1
            ) {
                throw new Error(
                    `Invalid adulteration probability for class ${key}.`
                );
            }

            total += probability;
        }

        averagedProbabilities[key] =
            total / results.length;
    }

    // Find the class with the highest average probability.
    const bestClassKey = classKeys.reduce(
        (best, current) =>
            averagedProbabilities[current] >
            averagedProbabilities[best]
                ? current
                : best
    );

    const bestClass =
        results[0].probabilities[bestClassKey];

    const confidence =
        averagedProbabilities[bestClassKey];

    if (
        !bestClass ||
        typeof bestClass.adulterantType !== "string" ||
        !bestClass.adulterantType.trim()
    ) {
        throw new Error(
            "Adulterant type is missing from model output."
        );
    }

    return {
        // Current training dataset has no pure-milk class.
        adulterationPresent: null,

        adulterationType: bestClass.adulterantType,

        adulterationConfidence: Number(
            confidence.toFixed(6)
        ),

        modelVersion:
            results[0].model?.version || "1.0.0"
    };
}

// ============================================
// MODE 1 - MILK ANALYSIS PREDICTION
// ============================================

async function createMilkAnalysisResult(readings) {
    let totalFat = 0;
    let totalSnf = 0;
    let totalWater = 0;

    let modelVersion = "1.0.0";

    for (const reading of readings) {
        const result = await predictMilkAnalysis(
            reading.spectralValues
        );

        if (!result?.success || !result.prediction) {
            throw new Error(
                "Invalid milk analysis model prediction result."
            );
        }

        const {
            fat,
            snf,
            water
        } = result.prediction;

        if (
            ![fat, snf, water].every(value =>
                typeof value === "number" &&
                Number.isFinite(value)
            )
        ) {
            throw new Error(
                "Milk analysis model returned invalid values."
            );
        }

        totalFat += fat;
        totalSnf += snf;
        totalWater += water;

        modelVersion =
            result.model?.version || modelVersion;
    }

    const count = readings.length;

    return {
        fat: Number((totalFat / count).toFixed(2)),
        snf: Number((totalSnf / count).toFixed(2)),
        water: Number((totalWater / count).toFixed(2)),
        modelVersion
    };
}

// ============================================
// PROCESS MILK TEST PREDICTION
// ============================================

async function processMilkTest(sessionId) {
    const session = await MilkTestSession.findById(sessionId);

    if (!session) {
        throw new Error("Milk test session not found.");
    }

    if (session.status === "COMPLETED") {
        console.log("Milk test already completed:", sessionId);

        return MilkPrediction.findOne({
            testId: sessionId
        });
    }

    if (session.status === "FAILED") {
        throw new Error(
            session.lastError || "Milk test session has failed."
        );
    }

    try {
        await MilkTestSession.findByIdAndUpdate(
            sessionId,
            {
                $set: {
                    status: "PROCESSING",
                    stoppedAt: session.stoppedAt || new Date()
                }
            }
        );

        // Ensure all queued sensor readings are saved.
        await readingQueue;

        if (readingSaveErrors.length > 0) {
            throw new Error(
                `Failed to save ${readingSaveErrors.length} sensor reading(s).`
            );
        }

        const readings = await MilkTestReading.find({
            testId: sessionId
        }).sort({
            sequenceNumber: 1
        });

        if (!readings.length) {
            throw new Error(
                "No spectral readings were collected for this test."
            );
        }

        console.log(
            `Processing ${readings.length} readings for test ${sessionId}`
        );

        let predictionData = {};

        // ========================================
        // MODE 0 - ADULTERATION
        // ========================================

        if (session.mode === 0) {
            const result =
                await createAdulterationResult(readings);

            predictionData = {
                ...result
            };
        }

        // ========================================
        // MODE 1 - MILK QUALITY ANALYSIS
        // ========================================

        else if (session.mode === 1) {
            const result =
                await createMilkAnalysisResult(readings);

            predictionData = {
                ...result
            };
        } else {
            throw new Error(
                `Unsupported milk test mode: ${session.mode}`
            );
        }

        // ========================================
        // SAVE FINAL PREDICTION
        // ========================================

        const savedPrediction = await saveMilkPrediction({
            testId: session._id,
            farmerId: session.farmerId,
            deviceId: session.deviceId,
            mode: session.mode,
            totalReadings: readings.length,
            ...predictionData,
            predictedAt: new Date()
        });

        // ========================================
        // SEND FINAL RESULT TO HARDWARE
        // ========================================

        const hardwarePrediction = {
            testId: String(session._id),
            farmerCustomId: session.farmerCustomId,
            mode: session.mode,
            totalReadings: readings.length,
            prediction: predictionData,
            completedAt: new Date().toISOString()
        };

        await publishPrediction(
            session.farmerCustomId,
            hardwarePrediction
        );

        // ========================================
        // MARK SESSION COMPLETED
        // ========================================

        await MilkTestSession.findByIdAndUpdate(
            sessionId,
            {
                $set: {
                    status: "COMPLETED",
                    completedAt: new Date(),
                    totalReadings: readings.length,
                    lastError: null
                }
            }
        );

        console.log(
            "Milk test prediction completed:",
            sessionId
        );

        return savedPrediction;

    } catch (error) {
        console.error(
            "Milk test prediction processing failed:",
            error
        );

        await MilkTestSession.findByIdAndUpdate(
            sessionId,
            {
                $set: {
                    status: "FAILED",
                    lastError: error.message
                }
            }
        );

        throw error;
    }
}

// ============================================
// RESTORE ACTIVE SESSION AFTER SERVER RESTART
// ============================================

async function resumeActiveCollection() {
    const existingSession = await MilkTestSession.findOne({
        status: {
            $in: ACTIVE_STATUSES
        }
    }).sort({
        createdAt: -1
    });

    if (!existingSession) {
        activeSession = null;

        console.log(
            "No active Milk Analyzer test to recover."
        );

        return null;
    }

    activeSession = existingSession;

    console.log(
        "Existing collection workflow restored:",
        String(existingSession._id)
    );

    // Do not automatically restart hardware.
    // A STOPPING session needs explicit recovery handling.
    if (existingSession.status === "STOPPING") {
        console.warn(
            "Recovered session was STOPPING. Verify hardware state before proceeding."
        );
    }

    if (existingSession.status === "PROCESSING") {
        console.log(
            "Recovered PROCESSING session. Resuming prediction."
        );

        try {
            await processMilkTest(existingSession._id);

            activeSession = null;
        } catch (error) {
            console.error(
                "Recovered prediction failed:",
                error.message
            );
        }
    }

    return existingSession;
}

// ============================================
// DEVICE AND TEST STATUS
// ============================================

async function getDeviceStatus() {
    const mqttStatus = getMQTTStatus();

    const currentSession = activeSession
        ? await MilkTestSession.findById(activeSession._id)
            .populate(
                "farmerId",
                "userId fullname email contact village"
            )
            .populate(
                "requestedBy",
                "userId fullname email role"
            )
        : null;

    return {
        deviceId: DEVICE_ID,

        mqtt: mqttStatus,

        device: latestDeviceStatus,

        available:
            Boolean(mqttStatus?.connected) &&
            !currentSession,

        busy: Boolean(currentSession),

        activeSession: currentSession
    };
}

// ============================================
// INITIALIZE MILK TEST SERVICE
// ============================================

async function initializeMilkTestService() {
    registerMQTTListeners();

    console.log(
        "Initializing Milk Test service..."
    );

    await resumeActiveCollection();

    console.log(
        "Milk Test service initialized."
    );
}

/* ============================================
   START MILK TEST
============================================ */

async function startTest({
    farmerId,
    farmerCustomId,
    requestedBy,
    requestedByRole,
    mode
}) {
    try {
        // Validate required fields.
        if (!farmerId || !farmerCustomId || !requestedBy) {
            throw new Error(
                "Farmer ID, Farmer Custom ID and Requested By are required."
            );
        }

        if (![0, 1].includes(Number(mode))) {
            throw new Error(
                "Invalid test mode. Mode must be 0 or 1."
            );
        }

        const normalizedMode = Number(mode);

        // Only one physical analyzer can run one test at a time.
        if (activeSession) {
            const existingSession = await MilkTestSession.findById(
                activeSession._id
            );

            if (
                existingSession &&
                ACTIVE_STATUSES.includes(existingSession.status)
            ) {
                throw new Error(
                    "Milk Analyzer is currently busy with another test."
                );
            }

            activeSession = null;
        }

        // Check the hardware MQTT connection.
        const mqttStatus = getMQTTStatus();

        if (!mqttStatus?.connected) {
            throw new Error(
                "MQTT device connection is unavailable."
            );
        }

        // Wait for previous reading operations before starting a new test.
        await readingQueue;

        // Clear old errors for the new test.
        readingSaveErrors = [];

        // Create new session.
        const session = await MilkTestSession.create({
            farmerId,
            farmerCustomId,
            requestedBy,
            requestedByRole,
            deviceId: DEVICE_ID,
            mode: normalizedMode,
            status: "STARTING",
            startedAt: new Date(),
            totalReadings: 0
        });

        activeSession = session;

        try {
            // Send selected mode to hardware.
            await publishMode(
                farmerCustomId,
                String(normalizedMode)
            );

            // Enable sensor data collection.
            await publishEnable(
                farmerCustomId,
                "1"
            );

            await MilkTestSession.findByIdAndUpdate(
                session._id,
                {
                    $set: {
                        startCommandSentAt: new Date()
                    }
                }
            );

            console.log(
                "Milk test started:",
                {
                    testId: String(session._id),
                    farmerCustomId,
                    mode: normalizedMode
                }
            );

            return await MilkTestSession.findById(
                session._id
            )
                .populate(
                    "farmerId",
                    "userId fullname email contact village"
                )
                .populate(
                    "requestedBy",
                    "userId fullname email role"
                );

        } catch (commandError) {
            await MilkTestSession.findByIdAndUpdate(
                session._id,
                {
                    $set: {
                        status: "FAILED",
                        lastError: commandError.message
                    }
                }
            );

            activeSession = null;

            throw commandError;
        }

    } catch (error) {
        console.error(
            "Start Milk Test Error:",
            error.message
        );

        throw error;
    }
}

/* ============================================
   STOP MILK TEST
============================================ */

async function stopTest({
    requestedBy,
    requestedByRole
} = {}) {
    try {
        if (!activeSession) {
            throw new Error(
                "No active Milk Analyzer test found."
            );
        }

        const session = await MilkTestSession.findById(
            activeSession._id
        );

        if (!session) {
            activeSession = null;

            throw new Error(
                "Active Milk Test session not found."
            );
        }

        if (
            ["STOPPING", "PROCESSING", "COMPLETED"].includes(
                session.status
            )
        ) {
            throw new Error(
                `Milk test is already ${session.status.toLowerCase()}.`
            );
        }

        if (session.status === "FAILED") {
            throw new Error(
                "Cannot stop a failed Milk Test session."
            );
        }

        // Mark the session as stopping.
        session.status = "STOPPING";
        session.stoppedAt = new Date();

        await session.save();

        activeSession = session;

        // Stop hardware collection.
        await publishEnable(
            session.farmerCustomId,
            "0"
        );

        await MilkTestSession.findByIdAndUpdate(
            session._id,
            {
                $set: {
                    stopCommandSentAt: new Date()
                }
            }
        );

        console.log(
            "Milk test collection stopped:",
            String(session._id)
        );

        // Wait until all received readings are saved.
        await readingQueue;

        if (readingSaveErrors.length > 0) {
            throw new Error(
                `Unable to save ${readingSaveErrors.length} sensor reading(s).`
            );
        }

        // Update status before prediction.
        await MilkTestSession.findByIdAndUpdate(
            session._id,
            {
                $set: {
                    status: "PROCESSING"
                }
            }
        );

        activeSession = session;

        // Run the selected ML model.
        const prediction = await processMilkTest(
            session._id
        );

        activeSession = null;

        console.log(
            "Milk test completed successfully:",
            String(session._id)
        );

        return {
            success: true,
            message: "Milk test completed successfully.",
            testId: String(session._id),
            farmerCustomId: session.farmerCustomId,
            mode: session.mode,
            prediction
        };

    } catch (error) {
        console.error(
            "Stop Milk Test Error:",
            error.message
        );

        throw error;
    }
}

/* ============================================
   MODULE EXPORTS
============================================ */

module.exports = {
    initializeMilkTestService,
    resumeActiveCollection,
    getDeviceStatus,
    startTest,
    stopTest,
    processMilkTest
};
