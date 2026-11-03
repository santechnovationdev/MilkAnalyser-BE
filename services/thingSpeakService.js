const axios = require("axios");
const mongoose = require("mongoose");
const SensorData = require("../models/SensorData");

const CHANNEL_ID = process.env.THINGSPEAK_CHANNEL_ID;
const READ_API_KEY = process.env.THINGSPEAK_READ_API_KEY;

const DURATION_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 5000;

const channelUrl =
    `https://api.thingspeak.com/channels/${CHANNEL_ID}/feeds`;

const activeLoops = new Set();

const sleep = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms));

const getLatestFeed = async () => {
    const { data } = await axios.get(
        `${channelUrl}/last.json`,
        {
            params: {
                api_key: READ_API_KEY,
            },
            timeout: 15000,
        }
    );

    if (!data || !Number.isFinite(Number(data.entry_id))) {
        throw new Error("Unable to retrieve the latest ThingSpeak entry.");
    }

    return data;
};

const parseSpectralValues = (rawValue, mode) => {
    if (
        rawValue === undefined ||
        rawValue === null ||
        String(rawValue).trim() === ""
    ) {
        return null;
    }

    const values = String(rawValue)
        .split(",")
        .map((value) => Number(value.trim()));

    const expectedLength = mode === 0 ? 18 : 1;

    if (
        values.length !== expectedLength ||
        !values.every(Number.isFinite)
    ) {
        return null;
    }

    return values;
};

// MODE 0: Collect adulteration data continuously for five minutes.
const pollAdulteration = async (measurementId) => {
    const session = await SensorData.findById(measurementId);

    if (
        !session ||
        session.status !== "running" ||
        session.mode !== 0
    ) {
        return;
    }

    const { data } = await axios.get(
        `${channelUrl}.json`,
        {
            params: {
                api_key: READ_API_KEY,
                results: 8000,
            },
            timeout: 15000,
        }
    );

    const feeds = (data.feeds || [])
        .filter((feed) => {
            const entryId = Number(feed.entry_id);
            const createdAt = new Date(feed.created_at).getTime();

            return (
                Number.isSafeInteger(entryId) &&
                entryId > session.lastProcessedEntryId &&
                Number.isFinite(createdAt) &&
                createdAt >= session.startedAt.getTime() &&
                createdAt <= session.endsAt.getTime()
            );
        })
        .sort(
            (a, b) => Number(a.entry_id) - Number(b.entry_id)
        );

    for (const feed of feeds) {
        const current = await SensorData.findById(measurementId);

        if (
            !current ||
            current.status !== "running" ||
            current.mode !== 0
        ) {
            return;
        }

        const entryId = Number(feed.entry_id);

        // Adulteration uses field1 only.
        const spectralValues = parseSpectralValues(feed.field1, 0);

        if (!spectralValues) {
            console.warn(
                `Invalid adulteration data in entry ${entryId}`
            );

            // Advance past invalid entries so they don't block later data.
            const skipped = await SensorData.updateOne(
                {
                    _id: measurementId,
                    status: "running",
                    lastProcessedEntryId: current.lastProcessedEntryId,
                },
                {
                    $set: {
                        lastProcessedEntryId: entryId,
                    },
                }
            );

            if (skipped.modifiedCount !== 1) {
                break;
            }

            continue;
        }

        // Add the reading and advance the cursor in one atomic operation.
        const result = await SensorData.updateOne(
            {
                _id: measurementId,
                mode: 0,
                status: "running",
                lastProcessedEntryId: current.lastProcessedEntryId,
                "readings.entryId": { $ne: entryId },
            },
            {
                $push: {
                    readings: {
                        entryId,
                        measuredAt: new Date(feed.created_at),
                        spectralValues,
                    },
                },
                $set: {
                    lastProcessedEntryId: entryId,
                },
            }
        );

        if (result.modifiedCount !== 1) {
            break;
        }

        console.log(
            `Adulteration saved: entry ${entryId}, ` +
            `${spectralValues.length} values`
        );
    }
};

// Run the five-minute adulteration collection loop.
const runAdulterationLoop = async (measurementId) => {
    const key = String(measurementId);

    if (activeLoops.has(key)) {
        return;
    }

    activeLoops.add(key);

    try {
        while (true) {
            const session = await SensorData.findById(measurementId);

            if (!session || session.status !== "running") {
                break;
            }

            const remaining =
                new Date(session.endsAt).getTime() - Date.now();

            if (remaining <= 0) {
                // One final retrieval before completing the session.
                await pollAdulteration(measurementId);

                await SensorData.updateOne(
                    {
                        _id: measurementId,
                        status: "running",
                    },
                    {
                        $set: {
                            status: "completed",
                        },
                    }
                );

                const completed = await SensorData.findById(measurementId);

                console.log(
                    `Adulteration completed: ` +
                    `${completed?.readings.length || 0}/30 readings`
                );

                break;
            }

            await pollAdulteration(measurementId);

            await sleep(
                Math.min(POLL_INTERVAL_MS, remaining)
            );
        }
    } catch (error) {
        console.error(
            "Adulteration collection error:",
            error.message
        );

        await SensorData.updateOne(
            {
                _id: measurementId,
                status: "running",
            },
            {
                $set: {
                    status: "failed",
                    lastError: error.message,
                },
            }
        );
    } finally {
        activeLoops.delete(key);
    }
};

// Start a new measurement session.
const startCollection = async (farmerId, mode) => {
    if (!mongoose.Types.ObjectId.isValid(farmerId)) {
        const error = new Error("Invalid farmerId.");
        error.statusCode = 400;
        throw error;
    }

    mode = Number(mode);

    if (![0, 1].includes(mode)) {
        const error = new Error("Mode must be 0 or 1.");
        error.statusCode = 400;
        throw error;
    }

    // Only one measurement can run on this shared ThingSpeak channel.
    const existingSession = await SensorData.findOne({
        status: "running",
    });

    if (existingSession) {
        const error = new Error(
            "Another measurement is already running."
        );

        error.statusCode = 409;
        throw error;
    }

    // Establish a baseline so previous entries aren't collected.
    const latestFeed = await getLatestFeed();

    const startEntryId = Number(latestFeed.entry_id);
    const startedAt = new Date();

    if (mode === 0) {
        const session = await SensorData.create({
            farmerId,
            mode: 0,
            startedAt,
            endsAt: new Date(startedAt.getTime() + DURATION_MS),
            startEntryId,
            lastProcessedEntryId: startEntryId,
            expectedReadings: 30,
            readings: [],
            status: "running",
        });

        // Start background polling without blocking the HTTP response.
        void runAdulterationLoop(session._id);

        return session;
    }

    // MODE 1: Read field2 once. No five-minute timer.
    const spectralValues = parseSpectralValues(
        latestFeed.field2,
        1
    );

    if (!spectralValues) {
        const error = new Error(
            "The latest ThingSpeak field2 value is empty or invalid."
        );

        error.statusCode = 422;
        throw error;
    }

    return SensorData.create({
        farmerId,
        mode: 1,
        startedAt,
        endsAt: null,
        startEntryId,
        lastProcessedEntryId: startEntryId,
        expectedReadings: 1,
        readings: [
            {
                entryId: startEntryId,
                measuredAt: new Date(latestFeed.created_at),
                spectralValues,
            },
        ],
        status: "completed",
    });
};

// Resume active adulteration sessions after a backend restart.
const resumeActiveCollections = async () => {
    const sessions = await SensorData.find({
        mode: 0,
        status: "running",
    });

    for (const session of sessions) {
        if (new Date(session.endsAt).getTime() > Date.now()) {
            void runAdulterationLoop(session._id);
        } else {
            await pollAdulteration(session._id);

            await SensorData.updateOne(
                {
                    _id: session._id,
                    status: "running",
                },
                {
                    $set: {
                        status: "completed",
                    },
                }
            );
        }
    }
};

module.exports = {
    startCollection,
    resumeActiveCollections,
};