const express = require("express");
const router = express.Router();

const {
   
    getLatestSensorData,
    getAllSensorData,
    getSensorDataById,
    deleteSensorData,
    setSensorMode,
    startTest,
    resetSensorTest,
    processSensorResult,
    getFarmerMeasurements,
} = require("../controllers/sensorController");

// Fetch latest ThinkSpeak data and save to MongoDB
// router.get("/fetchAPI", fetchThinkSpeakData);

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


// Start processing ThingSpeak data for a farmer
router.post("/process-result", processSensorResult);

// Get measurement history for a farmer
router.get("/farmer/:farmerId/measurements", getFarmerMeasurements);


module.exports = router;