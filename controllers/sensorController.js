const axios = require("axios");
const SensorData = require("../models/SensorData");

// Fetch data from ThinkSpeak and save to MongoDB
const fetchThinkSpeakData = async (req, res) => {
    try {

        const CHANNEL_ID = process.env.THINGSPEAK_CHANNEL_ID;
        const READ_API_KEY = process.env.THINGSPEAK_READ_API_KEY;

        const url = `https://api.thingspeak.com/channels/${CHANNEL_ID}/feeds/last.json?api_key=${READ_API_KEY}`;

        const { data } = await axios.get(url);

        if (!data) {
            return res.status(404).json({
                success: false,
                message: "No data received from ThinkSpeak."
            });
        }

        // Check duplicate entry
        const exists = await SensorData.findOne({
            entryId: data.entry_id
        });

        if (exists) {
            return res.status(200).json({
                success: true,
                message: "Data already exists.",
                sensorData: exists
            });
        }

        // field1 contains 13 values separated by commas
        const spectral = data.field1
            ? data.field1.split(",").map(Number)
            : [];

        const sensorData = await SensorData.create({
            entryId: data.entry_id,
            spectral,
            ultrasonic: Number(data.field2),
            temperature: Number(data.field3)
        });

        return res.status(201).json({
            success: true,
            message: "Sensor data stored successfully.",
            sensorData
        });

    } catch (error) {

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
                    spectral: data.field1 ? data.field1.split(",").map(Number) : [],
                    ultrasonic: Number(data.field2),
                    temperature: Number(data.field3)
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

module.exports = {
    fetchThinkSpeakData,
    getLatestSensorData,
    getAllSensorData,
    getSensorDataById,
    deleteSensorData
};