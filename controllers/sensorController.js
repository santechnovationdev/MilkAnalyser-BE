const axios = require("axios");
const SensorData = require("../models/SensorData");



const saveThinkSpeakData = async (mode) => {
    console.log("Mode:", mode)

    const CHANNEL_ID = process.env.THINGSPEAK_CHANNEL_ID;
    const READ_API_KEY = process.env.THINGSPEAK_READ_API_KEY;

    const url = `https://api.thingspeak.com/channels/${CHANNEL_ID}/feeds/last.json?api_key=${READ_API_KEY}`;

    const { data } = await axios.get(url);

    console.log("ThingSpeak Sensor Data:", data);

    if (!data) {
        throw new Error("No data received from ThingSpeak.");
    }

    const entryId = data.entry_id;

    const exists = await SensorData.findOne({ entryId });

    if (exists) {
        return {
            created: false,
            message: "Data already exists.",
            sensorData: exists
        };
    }

    let spectralAnalyses = [];
    let spectralAdultration = [];

    if (mode === 0) {

        // field1 → Milk Adulteration
        spectralAdultration = data.field1
            ? data.field1.split(",").map(Number)
            : [];

        if (spectralAdultration.length !== 18) {
            throw new Error(
                `Invalid adulteration spectral data. Received: ${spectralAdultration.length}, Expected: 18`
            );
        }

    } else if (mode === 1) {

        // field2 → Milk Analysis
        spectralAnalyses = data.field2
            ? data.field2.split(",").map(Number)
            : [];

        if (spectralAnalyses.length !== 18) {
            throw new Error(
                `Invalid analysis spectral data. Received: ${spectralAnalyses.length}, Expected: 18`
            );
        }

    } else {

        throw new Error("Invalid sensor mode.");
    }

    const sensorData = await SensorData.create({
        entryId,
        spectralAnalyses,
        spectralAdultration
    });

    return {
        created: true,
        message: "Sensor data stored successfully.",
        sensorData
    };
};


const processSensorResult = async (req, res) => {

    try {

        const mode = Number(req.query.mode);
        console.log("Mode:", mode)

        if (mode !== 0 && mode !== 1) {
            return res.status(400).json({
                success: false,
                message: "Invalid sensor mode."
            });
        }

        const result = await saveThinkSpeakData(mode);

        return res.status(result.created ? 201 : 200).json({
            success: true,
            ...result
        });

    } catch (error) {

        console.log("Error processing sensor result:", error);

        return res.status(500).json({
            success: false,
            message: error.message
        });

    }

};

// Fetch data from ThinkSpeak and save to MongoDB
const fetchThinkSpeakData = async (req, res) => {

    try {

        const result = await saveThinkSpeakData();

        return res.status(result.created ? 201 : 200).json({
            success: true,
            ...result
        });

    } catch (error) {

        console.log("Error in fetch ThinkSpeak data:", error);

        return res.status(500).json({
            success: false,
            message: error.message
        });

    }

};

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
    fetchThinkSpeakData,
    saveThinkSpeakData,
    processSensorResult,
    getLatestSensorData,
    getAllSensorData,
    getSensorDataById,
    deleteSensorData,
    setSensorMode, startTest, resetSensorTest
};