const mongoose = require("mongoose");

const milkPredictSchema = new mongoose.Schema(
    {
        farmerId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },

        // Link to raw sensor data
        // sensorDataId: { type: mongoose.Schema.Types.ObjectId, ref: "SensorData" },

        quantity: { type: Number, required: true },

        fat: { type: Number, required: true },

        protein: { type: Number, required: true },

        snf: { type: Number, required: true },

        density: { type: Number, required: true },

        // temp: { type: Number, required: true },

        quality: { type: String, enum: ["Good", "Average", "Poor"] },

        adulteration: { type: String, default: "No" }

    },
    {
        timestamps: true
    });
const MilkPredict = mongoose.model("MilkPredict", milkPredictSchema);
module.exports = MilkPredict