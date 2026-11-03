const axios = require("axios");
const SensorData = require("../models/SensorData");
const { startCollection } = require("../services/thingSpeakService");
const {mongoose} = require('mongoose')


// Start ThingSpeak processing for the selected farmer and mode.
const processSensorResult = async (req, res) => {
    try {
        const farmerId = req.body?.farmerId;
        const mode = Number(req.body?.mode);

        // console.log("Farmer ID:", farmerId);
        // console.log("Sensor mode:", mode);

        if (
            !farmerId ||
            !mongoose.Types.ObjectId.isValid(farmerId)
        ) {
            return res.status(400).json({
                success: false,
                message: "A valid farmerId is required.",
            });
        }

        if (![0, 1].includes(mode)) {
            return res.status(400).json({
                success: false,
                message: "Invalid sensor mode. Use 0 or 1.",
            });
        }

        const measurement = await startCollection(farmerId, mode);

        return res.status(mode === 0 ? 202 : 201).json({
            success: true,
            message:
                mode === 0
                    ? "Adulteration collection started for five minutes."
                    : "Milk analysis value saved successfully.",
            measurement,
        });
    } catch (error) {
        console.error(
            "Error processing sensor result:",
            error.message
        );

        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message,
        });
    }
};


// Retrieve measurement sessions for a specific farmer.
const getFarmerMeasurements = async (req, res) => {
    try {
        const { farmerId } = req.params;

        const mode =
            req.query.mode === undefined
                ? undefined
                : Number(req.query.mode);

        if (!mongoose.Types.ObjectId.isValid(farmerId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid farmerId.",
            });
        }

        if (
            mode !== undefined &&
            ![0, 1].includes(mode)
        ) {
            return res.status(400).json({
                success: false,
                message: "Mode must be 0 or 1.",
            });
        }

        const filter = { farmerId };

        if (mode !== undefined) {
            filter.mode = mode;
        }

        const measurements = await SensorData.find(filter)
            .sort({ startedAt: -1 })
            .lean();

        return res.status(200).json({
            success: true,
            count: measurements.length,
            measurements,
        });
    } catch (error) {
        console.error(
            "Error retrieving farmer measurements:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

// Fetch data from ThinkSpeak and save to MongoDB
// const fetchThinkSpeakData = async (req, res) => {

//     try {

//         const result = await saveThinkSpeakData();

//         return res.status(result.created ? 201 : 200).json({
//             success: true,
//             ...result
//         });

//     } catch (error) {

//         console.log("Error in fetch ThinkSpeak data:", error);

//         return res.status(500).json({
//             success: false,
//             message: error.message
//         });

//     }

// };

// Get latest sensor data
const getLatestSensorData = async (req, res) => {
    try {

        const CHANNEL_ID = process.env.THINGSPEAK_CHANNEL_ID;
        const READ_API_KEY = process.env.THINGSPEAK_READ_API_KEY;

        const url = `https://api.thingspeak.com/channels/${CHANNEL_ID}/feeds/last.json?api_key=${READ_API_KEY}`;

        const { data } = await axios.get(url);

        if (data) {

            const exists = await SensorData.findOne({
                entryId: data.entry_id
            });

            if (!exists) {

                await SensorData.create({
                    entryId: data.entry_id,
                    spectralAnalyses: data.field2 ? data.field2.split(",").map(Number) : [],
                    spectralAdultration: data.field1 ? data.field1.split(",").map(Number) : [],
                    // ultrasonic: Number(data.field2),
                    // temperature: Number(data.field3)
                });

            }

        }

        const sensorData = await SensorData.findOne().sort({ entryId: -1 });

        if (!sensorData) {
            return res.status(404).json({
                success: false,
                message: "No sensor data found."
            });
        }

        return res.status(200).json({
            success: true,
            sensorData
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            message: err.message
        });

    }
};

// Get all sensor data
const getAllSensorData = async (req, res) => {

    try {

        const sensorData = await SensorData
            .find()
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: sensorData.length,
            sensorData
        });

    } catch (error) {

        return res.status(500).json({
            success: false,
            message: error.message
        });

    }

};

// Get sensor data by ID
const getSensorDataById = async (req, res) => {

    try {

        const sensorData = await SensorData.findById(req.params.id);

        if (!sensorData) {
            return res.status(404).json({
                success: false,
                message: "Sensor data not found."
            });
        }

        return res.status(200).json({
            success: true,
            sensorData
        });

    } catch (error) {

        return res.status(500).json({
            success: false,
            message: error.message
        });

    }

};

// Delete sensor data
const deleteSensorData = async (req, res) => {

    try {

        const sensorData = await SensorData.findById(req.params.id);

        if (!sensorData) {
            return res.status(404).json({
                success: false,
                message: "Sensor data not found."
            });
        }

        await sensorData.deleteOne();

        return res.status(200).json({
            success: true,
            message: "Sensor data deleted successfully."
        });

    } catch (error) {

        return res.status(500).json({
            success: false,
            message: error.message
        });

    }

};


// Set milk mode:-
// Set milk mode
const setSensorMode = async (req, res) => {

    try {

        const { mode } = req.body;
        console.log("Mode:", mode)

        if (mode !== 0 && mode !== 1) {

            return res.status(400).json({
                success: false,
                message: "Mode must be 0 or 1."
            });

        }

        const WRITE_API_KEY = process.env.THINGSPEAK_CONTROL_WRITE_API_KEY;
        const CONTROL_CHANNEL_ID = process.env.THINGSPEAK_CONTROL_CHANNEL_ID;
        const CONTROL_READ_API_KEY = process.env.THINGSPEAK_CONTROL_READ_API_KEY;

        // Mode selection always means test is not running
        const field1 = 0;
        const field2 = mode;

        const url = `https://api.thingspeak.com/update?api_key=${WRITE_API_KEY}&field1=${field1}&field2=${field2}`;

        const { data } = await axios.get(url);
        console.log("Datas:-", data)

        if (!data || Number(data) <= 0) {

            return res.status(500).json({
                success: false,
                message: "Failed to update mode in ThingSpeak."
            });

        }

        return res.status(200).json({
            success: true,
            message: "Mode updated successfully.",
            mode: field2,
            field1,
            entryId: data
        });

    } catch (error) {

        console.log("Error in set the mode:", error);

        return res.status(500).json({
            success: false,
            message: error.message
        });

    }

};


// Start test
const startTest = async (req, res) => {

    try {

        const WRITE_API_KEY = process.env.THINGSPEAK_CONTROL_WRITE_API_KEY;
        const CONTROL_CHANNEL_ID = process.env.THINGSPEAK_CONTROL_CHANNEL_ID;
        const CONTROL_READ_API_KEY = process.env.THINGSPEAK_CONTROL_READ_API_KEY;

        // Get latest control channel data
        const readUrl = `https://api.thingspeak.com/channels/${CONTROL_CHANNEL_ID}/feeds/last.json?api_key=${CONTROL_READ_API_KEY}`;

        const { data: controlData } = await axios.get(readUrl);

        if (!controlData) {

            return res.status(404).json({
                success: false,
                message: "Unable to get current sensor mode."
            });

        }

        // Keep the current mode
        const currentMode = Number(controlData.field2);

        if (currentMode !== 0 && currentMode !== 1) {

            return res.status(400).json({
                success: false,
                message: "Invalid current sensor mode."
            });

        }

        // Start test
        const field1 = 1;
        const field2 = currentMode;

        const url = `https://api.thingspeak.com/update?api_key=${WRITE_API_KEY}&field1=${field1}&field2=${field2}`;

        const { data } = await axios.get(url);

        console.log("Start test ThingSpeak response:", data);

        if (!data || Number(data) <= 0) {

            return res.status(500).json({
                success: false,
                message: "Failed to start test."
            });

        }

        return res.status(200).json({
            success: true,
            message: "Test started successfully.",
            field1,
            field2,
            entryId: data
        });

    } catch (error) {

        console.log("Error in start test:", error);

        return res.status(500).json({
            success: false,
            message: error.message
        });

    }

};


// Reset test
const resetSensorTest = async (req, res) => {

    try {

        const WRITE_API_KEY = process.env.THINGSPEAK_CONTROL_WRITE_API_KEY;
        const CONTROL_CHANNEL_ID = process.env.THINGSPEAK_CONTROL_CHANNEL_ID;
        const CONTROL_READ_API_KEY = process.env.THINGSPEAK_CONTROL_READ_API_KEY;

        const readUrl = `https://api.thingspeak.com/channels/${CONTROL_CHANNEL_ID}/feeds/last.json?api_key=${CONTROL_READ_API_KEY}`;

        const { data: controlData } = await axios.get(readUrl);

        console.log("Current control data:", controlData);

        if (!controlData) {
            return res.status(404).json({
                success: false,
                message: "Unable to get current sensor mode."
            });
        }

        const currentMode = Number(controlData.field2);

        if (currentMode !== 0 && currentMode !== 1) {
            return res.status(400).json({
                success: false,
                message: "Invalid current sensor mode."
            });
        }

        const field1 = 0;
        const field2 = currentMode;

        const url = `https://api.thingspeak.com/update?api_key=${WRITE_API_KEY}&field1=${field1}&field2=${field2}`;

        const response = await axios.get(url);

        console.log("Reset ThingSpeak response:", response.data);

        const entryId = Number(response.data);

        if (!entryId || entryId <= 0) {

            return res.status(500).json({
                success: false,
                message: "Failed to reset test.",
                thingSpeakResponse: response.data
            });

        }

        return res.status(200).json({
            success: true,
            message: "Test reset successfully.",
            field1,
            field2,
            entryId
        });

    } catch (error) {

        console.log("Error in reset test:", error);

        return res.status(500).json({
            success: false,
            message: error.message
        });

    }

};

module.exports = {
    // fetchThinkSpeakData,
    // saveThinkSpeakData,
    processSensorResult,
    getFarmerMeasurements,
    getLatestSensorData,
    getAllSensorData,
    getSensorDataById,
    deleteSensorData,
    setSensorMode, startTest, resetSensorTest
};