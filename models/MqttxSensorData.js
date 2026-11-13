const mongoose = require("mongoose");

const readingSchema = new mongoose.Schema(
    {
        entryId: {
            type: Number,
            // required: true,
        },

        measuredAt: {
            type: Date,
            required: true,
        },

        spectralValues: {
            type: [Number],
            required: true,
            validate: {
                validator: (values) =>
                    values.length === 18,
                message:
                    "Exactly 18 spectral values are required",
            },
        },
    },
    { _id: false }
);

const sensorDataSchema = new mongoose.Schema({
    farmerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Farmer",
        required: true,
    },

    mode: {
        type: Number,
        required: true,
    },

    status: {
        type: String,
        enum: ["collecting", "completed", "failed"],
        default: "collecting",
    },

    startedAt: Date,

    stoppedAt: Date,

    readings: {
        type: [readingSchema],
        default: [],
    },
});

module.exports = mongoose.model( "SensorData", sensorDataSchema);