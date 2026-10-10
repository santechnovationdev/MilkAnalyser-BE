const express = require("express");
const router = express.Router();

const {
    fetchThinkSpeakData,
    getLatestSensorData,
    getAllSensorData,
    getSensorDataById,
    deleteSensorData,
    setSensorMode,
    startTest,
    resetSensorTest,
    processSensorResult
} = require("../controllers/sensorController");

// Fetch latest ThinkSpeak data and save to MongoDB
router.get("/fetchAPI", fetchThinkSpeakData);

// Get latest sensor data
router.get("/latestData", getLatestSensorData);

// Get all sensor data
router.get("/allSensorData", getAllSensorData);

// Get sensor data by MongoDB ID
router.get("/fetchData/:id", getSensorDataById);

// Delete sensor data
router.delete("/deleteSensorData/:id", deleteSensorData);

// Set the modes for Milk analyser:
router.post('/setMode', setSensorMode)

// set start test:
router.post('/startTest', startTest)
router.post('/resetTest', resetSensorTest)


router.get("/process-result", processSensorResult);


module.exports = router;