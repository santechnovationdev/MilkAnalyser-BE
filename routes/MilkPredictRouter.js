const express = require("express");
const router = express.Router();

const {
    createPrediction,
    getPredictions,
    getPredictionById,
    getPredictionByFarmer,
    deletePrediction
} = require("../controllers/predictController");

// Save milk analysis
router.post("/createPredict", createPrediction);

// Get all analyses
router.get("/fetchAllPredict", getPredictions);

// Get analysis by ID
router.get("/fetchPredict/:id", getPredictionById);

// Get all analyses for a farmer
router.get("/farmer/:farmerId", getPredictionByFarmer);

// Delete analysis
router.delete("/deletePredict/:id", deletePrediction);

module.exports = router;