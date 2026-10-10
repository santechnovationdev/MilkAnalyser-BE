const mongoose = require("mongoose");

const sensorDataSchema = new mongoose.Schema(
    {
        entryId: { type: Number, required: true, unique: true },

        spectralAnalyses: {
            type: [Number], default: [], validate: {
                validator: (arr) => arr.length === 0 || arr.length === 18,
                message: "Spectral sensor must contain 18 values."
            }
        },

        spectralAdultration: {
            type: [Number], default: [], validate: {
                validator: (arr) => arr.length === 0 || arr.length === 18,
                message: "Spectral sensor must contain 18 values."
            }
        },

        // ultrasonic: { type: Number, required: true },

        // temperature: { type: Number, required: true }

    },
    {
        timestamps: true
    });
const SensorModel = mongoose.model("SensorData", sensorDataSchema);
module.exports = SensorModel