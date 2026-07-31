const mongoose = require("mongoose");

const sensorDataSchema = new mongoose.Schema(
    {
        entryId: { type: Number, required: true, unique: true },

        spectral: {
            type: [Number], required: true, validate: {
                validator: (arr) => arr.length === 13,
                message: "Spectral sensor must contain 13 values."
            }
        },

        ultrasonic: { type: Number, required: true },

        temperature: { type: Number, required: true }

    },
    {
        timestamps: true
    });
const SensorModel = mongoose.model("SensorData", sensorDataSchema);
module.exports = SensorModel