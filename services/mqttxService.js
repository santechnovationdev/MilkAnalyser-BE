
const mqtt = require("mqtt");
const mongoose = require("mongoose");

const SensorData = require("../models/SensorData");

// -------------------------------------------
// MQTT CONFIGURATION
// -------------------------------------------

const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || `mqtts://${process.env.MQTT_HOST}:8883`;

const MQTT_TOPIC = "san-milk-a84f29/01/#";

const SPECTRUM_TOPIC = "san-milk-a84f29/01/result/spectrum";

const MODE_TOPIC = "san-milk-a84f29/01/control/mode";

const STATUS_TOPIC = "san-milk-a84f29/01/status";

// const MQTT_CLIENT_ID = "mqttx_821769b9";
const MQTT_CLIENT_ID = "milkanalyser_backend_01";

let mqttClient = null;
let activeMeasurementId = null;

let writeQueue = Promise.resolve();
let collectionOperation = Promise.resolve();

// -------------------------------------------
// SERIALIZE START / STOP OPERATIONS
// -------------------------------------------

const runCollectionOperation = (operation) => {
    const result = collectionOperation.then(operation);

    collectionOperation = result.catch(() => { });

    return result;
};

// -------------------------------------------
// 1. CONNECT TO MQTT BROKER
// -------------------------------------------

const connectMQTT = () => {
    if (mqttClient) {
        return mqttClient;
    }

    const client = mqtt.connect(MQTT_BROKER_URL, {
        clientId: MQTT_CLIENT_ID,
        username: process.env.MQTT_USERNAME || undefined,
        password: process.env.MQTT_PASSWORD || undefined,
        protocolVersion: 5,
        reconnectPeriod: 5000,
        connectTimeout: 30000,
        clean: true,
    });

    mqttClient = client;

    client.on("connect", () => {
        console.log("EMQX MQTT Broker Connected");

        client.subscribe(MQTT_TOPIC, { qos: 1 }, (error, granted) => {
            if (error) {
                console.error("MQTT Subscribe Error:", error.message);
                return;
            }

            if (!granted || !granted.some((item) => item.qos !== 128)) {
                console.error("MQTT subscription was not granted");
                return;
            }

            console.log(`Subscribed to: ${MQTT_TOPIC}`);
        }
        );
    });

    client.on("message", (topic, message) => {
        if (topic === STATUS_TOPIC) {
            console.log("Device status:", message.toString());
            return;
        }

        if (topic !== SPECTRUM_TOPIC) {
            return;
        }

        const measurementId = activeMeasurementId;

        if (!measurementId) {
            return;
        }

        writeQueue = writeQueue
            .then(() => saveMQTTReading(measurementId, message))
            .catch((error) => {
                console.error("MQTT Save Error:", error.message);
            });
    });

    client.on("error", (error) => {
        console.error("MQTT Connection Error:", error.message);
    });

    client.on("reconnect", () => {
        console.log("Reconnecting to EMQX...");
    });

    client.on("offline", () => {
        console.log("EMQX MQTT connection offline");
    });

    client.on("close", () => {
        console.log("EMQX MQTT connection closed");
    });

    return client;
};

// -------------------------------------------
// 2. RESUME ACTIVE COLLECTION
// -------------------------------------------

const resumeActiveCollection = async () => {
    const measurements = await SensorData.find({ mode: 0, status: "running", }).sort({ startedAt: -1 }).limit(2);

    if (measurements.length > 1) {
        throw new Error(
            "Multiple running spectral collections found. " +
            "Resolve them before starting MQTT."
        );
    }

    const measurement = measurements[0] || null;

    activeMeasurementId = measurement ? measurement._id.toString() : null;

    if (measurement) {
        console.log("Resumed MQTT Collection:", activeMeasurementId);
    }

    return measurement;
};

const publishCollectionCommand = (value) => {
    return new Promise((resolve, reject) => {

        if (!mqttClient || !mqttClient.connected) {
            return reject(new Error("MQTT Broker Not Connected"));
        }

        const payload = String(value);

        console.log("Publishing MQTT Command...");
        console.log("Broker:", MQTT_BROKER_URL);
        console.log("Topic:", MODE_TOPIC);
        console.log("Payload:", payload);
        console.log("Connected:", mqttClient.connected);

        mqttClient.publish(
            MODE_TOPIC,
            payload,
            {
                qos: 1,
                retain: false
            },
            (error) => {
                if (error) {
                    console.error("MQTT Publish Failed:", error);
                    return reject(error);
                }

                console.log("MQTT Publish Completed:", payload);
                resolve();
            }
        );
    });
};
// -------------------------------------------
// 3. START COLLECTION
// -------------------------------------------

const startCollection = (farmerId, mode = 0) =>
    runCollectionOperation(async () => {
        if (!mongoose.Types.ObjectId.isValid(farmerId)) {
            throw new Error("Invalid Farmer ID");
        }

        if (Number(mode) !== 0) {
            throw new Error("MQTT spectral collection supports mode 0 only");
        }

        if (!mqttClient || !mqttClient.connected) {
            throw new Error("MQTT Broker Not Connected");
        }

        if (activeMeasurementId) {
            throw new Error("A collection is already running. Stop it first.");
        }

        const existing = await SensorData.findOne({ mode: 0, status: "running", });

        if (existing) {
            activeMeasurementId = existing._id.toString();

            throw new Error("An active collection already exists");
        }

        const measurement = await SensorData.create({
            farmerId,
            mode: 0,
            status: "running",
            startedAt: new Date(),
            endsAt: null,
            stoppedAt: null,
            startEntryId: null,
            lastProcessedEntryId: null,
            expectedReadings: null,
            readings: [],
            lastError: null,
        });

        try {
            // Send 1 to hardware
            await publishCollectionCommand(1);
        } catch (error) {
            await SensorData.deleteOne({ _id: measurement._id });
            throw error;
        }

        activeMeasurementId = measurement._id.toString();

        console.log("MQTT Collection Started:", activeMeasurementId);

        return measurement;
    });

// -------------------------------------------
// 4. VALIDATE MQTT JSON
// -------------------------------------------

const SPECTRAL_CHANNELS = [
    "A410", "B435", "C460", "D485",
    "E510", "F535", "G560", "H585",
    "R610", "I645", "S680", "J705",
    "T730", "U760", "V810", "W860",
    "K900", "L940"
];

const parseSpectralMessage = (message) => {
    const payload = JSON.parse(message.toString("utf8"));

    if (!payload || typeof payload !== "object" || !payload.spectrum || typeof payload.spectrum !== "object") {
        throw new Error("Invalid spectrum payload");
    }

    const spectralValues = SPECTRAL_CHANNELS.map((channel) => {
        const value = payload.spectrum[channel];

        if (typeof value !== "number" || !Number.isFinite(value)) {
            throw new Error(`Invalid value for ${channel}`);
        }

        return value;
    });

    return {
        measuredAt: new Date(),
        spectralValues
    };
};

// -------------------------------------------
// 5. SAVE MQTT READING TO MONGODB
// -------------------------------------------

const saveMQTTReading = async (measurementId, message) => {
    let reading;
    try {
        reading = parseSpectralMessage(message);
    } catch (error) {
        console.error("Invalid MQTT JSON:", error.message);
        return;
    }

    const measurement = await SensorData.findOneAndUpdate(
        {
            _id: measurementId,
            mode: 0,
            status: "running",
        },
        [
            {
                $set: {
                    lastProcessedEntryId: {
                        $add: [
                            {
                                $ifNull: [
                                    "$lastProcessedEntryId", 0,],
                            },
                            1,
                        ],
                    },

                    readings: {
                        $concatArrays: [
                            { $ifNull: ["$readings", []] },
                            [
                                {
                                    entryId: {
                                        $add: [
                                            { $ifNull: ["$lastProcessedEntryId", 0,], },
                                            1,
                                        ],
                                    },
                                    measuredAt: { $literal: reading.measuredAt, },
                                    spectralValues: { $literal: reading.spectralValues, },
                                },
                            ],
                        ],
                    },
                },
            },
        ],
        {
            new: true,
        }
    );

    if (measurement) {
        console.log("Saved MQTT Reading:", measurement.lastProcessedEntryId);
    } else {
        console.log("Reading ignored: collection not running");
    }
};

// -------------------------------------------
// 6. STOP COLLECTION
// -------------------------------------------

const stopCollection = (measurementId) =>
    runCollectionOperation(async () => {
        if (!mongoose.Types.ObjectId.isValid(measurementId)) {
            throw new Error("Invalid Measurement ID");
        }

        if (!activeMeasurementId || activeMeasurementId !== String(measurementId)) {
            throw new Error("This is not the active collection");
        }
        // Send 0 to hardware
        await publishCollectionCommand(0);

        // Stop accepting incoming readings
        activeMeasurementId = null;

        // Save pending readings
        await writeQueue;

        const stoppedAt = new Date();

        const measurement = await SensorData.findOneAndUpdate(
            {
                _id: measurementId,
                mode: 0,
                status: "running",
            },
            {
                $set: {
                    status: "completed",
                    stoppedAt,
                    endsAt: stoppedAt,
                },
            },
            {
                new: true,
                runValidators: true,
            }
        );

        if (!measurement) {
            throw new Error("Collection not found or already stopped");
        }

        console.log("MQTT Collection Stopped:", measurementId);

        return measurement;
    });

// -------------------------------------------
// 7. GET ACTIVE COLLECTION
// -------------------------------------------

const getActiveCollection = async () => {
    if (!activeMeasurementId) {
        return null;
    }

    return SensorData.findOne({
        _id: activeMeasurementId,
        mode: 0,
        status: "running",
    });
};


const publishSensorCommand = (field1, field2) => {
    return new Promise((resolve, reject) => {
        if (!mqttClient || !mqttClient.connected) {
            return reject(new Error("MQTT broker is not connected"));
        }

        if (![0, 1].includes(field1) || ![0, 1].includes(field2)) {
            return reject(new Error("Invalid field1 or field2 value"));
        }

        const topic = "milk/analyser/command";

        const payload = JSON.stringify({ field1, field2, });

        mqttClient.publish(topic, payload,
            { qos: 1, retain: false },
            (error) => {
                if (error) {
                    return reject(error);
                }

                console.log("MQTT command published:", payload);

                resolve({ topic, field1, field2, });
            }
        );
    });
};

// -------------------------------------------
// 8. EXPORT FUNCTIONS
// -------------------------------------------

module.exports = {
    connectMQTT,
    resumeActiveCollection,
    startCollection,
    stopCollection,
    getActiveCollection,
    publishSensorCommand
};
