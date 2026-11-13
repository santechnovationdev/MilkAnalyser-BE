
const express = require("express");
const router = express.Router();

const {
    startCollection,
    stopCollection,
    getActiveCollection, publishSensorCommand
} = require("../services/mqttxService");

// ------------------------------------
// START COLLECTION
// ------------------------------------
router.post("/collection/start", async (req, res) => {
    try {
        const { farmerId, mode = 0 } = req.body;

        if (!farmerId) {
            return res.status(400).json({
                success: false,
                message: "Farmer ID is required",
            });
        }

        const measurement = await startCollection(
            farmerId,
            mode
        );

        return res.status(201).json({
            success: true,
            message: "MQTT Collection Started Successfully",
            measurement,
        });

    } catch (error) {
        console.error("Start Collection Error:", error.message);

        return res.status(400).json({
            success: false,
            message: error.message,
        });
    }
});

// ------------------------------------
// STOP COLLECTION
// ------------------------------------
router.post("/collection/stop", async (req, res) => {
    try {
        const { measurementId } = req.body;

        if (!measurementId) {
            return res.status(400).json({
                success: false,
                message: "Measurement ID is required",
            });
        }

        const measurement = await stopCollection(
            measurementId
        );

        return res.status(200).json({
            success: true,
            message: "MQTT Collection Stopped Successfully",
            measurement,
        });

    } catch (error) {
        console.error("Stop Collection Error:", error.message);

        return res.status(400).json({
            success: false,
            message: error.message,
        });
    }
});

// ------------------------------------
// GET ACTIVE COLLECTION
// ------------------------------------
router.get("/collection/active", async (req, res) => {
    try {
        const measurement = await getActiveCollection();

        return res.status(200).json({
            success: true,
            measurement,
        });

    } catch (error) {
        console.error("Active Collection Error:", error.message);

        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});


// Toggle mode
router.post("/sensor/mode", async (req, res) => {
    try {
        const mode = Number(req.body.mode);

        const result = await publishSensorCommand(0, mode);

        res.json({ success: true, result });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message,
        });
    }
});

// Start test
router.post("/sensor/start-test", async (req, res) => {
    try {
        const mode = Number(req.body.mode);

        const result = await publishSensorCommand(1, mode);

        res.json({ success: true, result });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message,
        });
    }
});

// Reset test
router.post("/sensor/reset-test", async (req, res) => {
    try {
        const mode = Number(req.body.mode);

        const result = await publishSensorCommand(0, mode);

        res.json({ success: true, result });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message,
        });
    }
});

module.exports = router;
