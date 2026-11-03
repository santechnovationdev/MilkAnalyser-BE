const mongoose = require("mongoose");

const readingSchema = new mongoose.Schema(
    {
        entryId: {
            type: Number,
            required: true,
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
                    values.length === 18 || values.length === 1,
                message: "A reading must contain 18 values for adulteration or 1 value for analysis.",
            },
        },
    },
    { _id: false }
);

const sensorDataSchema = new mongoose.Schema(
    {
        farmerId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },

        mode: {
            type: Number,
            required: true,
            enum: [0, 1],
        },

        startedAt: {
            type: Date,
            required: true,
        },

        endsAt: {
            type: Date,
            default: null,
        },

        startEntryId: {
            type: Number,
            required: true,
        },

        lastProcessedEntryId: {
            type: Number,
            required: true,
        },

        expectedReadings: {
            type: Number,
            default: null,
        },

        readings: {
            type: [readingSchema],
            default: [],
        },

        status: {
            type: String,
            enum: ["running", "completed", "failed"],
            default: "running",
        },

        lastError: {
            type: String,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

// Validate readings according to the selected mode.
sensorDataSchema.pre("validate", function () {
    const expectedLength = this.mode === 0 ? 18 : 1;

    for (const reading of this.readings) {
        if (
            reading.spectralValues.length !== expectedLength ||
            !reading.spectralValues.every(Number.isFinite)
        ) {
            this.invalidate(
                "readings",
                `Mode ${this.mode} requires exactly ${expectedLength} numeric values per reading.`
            );

            break;
        }
    }
});

module.exports = mongoose.model("SensorData", sensorDataSchema);