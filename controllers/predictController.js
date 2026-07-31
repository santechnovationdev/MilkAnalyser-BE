const MilkPredict = require("../models/MilkCollection");

// Create Prediction
const createPrediction = async (req, res) => {
    try {

        const {
            farmerId,
            quantity,
            fat,
            protein,
            snf,
            water,
            temp,
            quality,
            adulteration
        } = req.body;

        const milkPredict = new MilkPredict({
            farmerId,
            quantity,
            fat,
            protein,
            snf,
            water,
            temp,
            quality,
            adulteration
        });

        const savePredict = await milkPredict.save();

        return res.status(201).json({
            success: true,
            message: "Milk analysis saved successfully.",
            prediction: savePredict
        });

    } catch (err) {

        console.log("Error in Create Milk Predict:", err);

        return res.status(500).json({
            success: false,
            message: err.message
        });

    }
};


// Get All Predictions
const getPredictions = async (req, res) => {

    try {

        const predictions = await MilkPredict.find()
            .populate("farmerId", "fullname email contact village")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: predictions.length,
            predictions
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            message: err.message
        });

    }

};


// Get Prediction By Id
const getPredictionById = async (req, res) => {

    try {

        const prediction = await MilkPredict.findById(req.params.id)
            .populate("farmerId", "fullname email contact village");

        if (!prediction) {

            return res.status(404).json({
                success: false,
                message: "Prediction not found."
            });

        }

        return res.status(200).json({
            success: true,
            prediction
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            message: err.message
        });

    }

};


// Get Prediction By Farmer
const getPredictionByFarmer = async (req, res) => {

    try {

        const predictions = await MilkPredict.find({
            farmerId: req.params.farmerId
        }).sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: predictions.length,
            predictions
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            message: err.message
        });

    }

};


// Delete Prediction
const deletePrediction = async (req, res) => {

    try {

        const prediction = await MilkPredict.findById(req.params.id);

        if (!prediction) {

            return res.status(404).json({
                success: false,
                message: "Prediction not found."
            });

        }

        await prediction.deleteOne();

        return res.status(200).json({
            success: true,
            message: "Prediction deleted successfully."
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            message: err.message
        });

    }

};


module.exports = {
    createPrediction,
    getPredictions,
    getPredictionById,
    getPredictionByFarmer,
    deletePrediction
};