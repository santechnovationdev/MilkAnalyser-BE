
const mongoose = require("mongoose");

const milkTestReadingSchema = new mongoose.Schema(
    {
        testId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "MilkTestSession",
            required: true,
            index: true
        },

        farmerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "users",
            required: true,
            index: true
        },

        deviceId: {
            type: String,
            required: true
        },

        sequenceNumber: {
            type: Number,
            required: true,
            min: 1
        },

        spectralValues: {
            type: [Number],
            required: true,
            validate: {
                validator: function (values) {
                    return (
                        Array.isArray(values) &&
                        values.length === 18 &&
                        values.every(
                            value =>
                                typeof value === "number" &&
                                Number.isFinite(value)
                        )
                    );
                },
                message:
                    "Exactly 18 valid spectral values are required."
            }
        },

        measuredAt: {
            type: Date,
            default: Date.now
        },

        sourceTopic: {
            type: String,
            required: true
        }
    },
    {
        timestamps: true
    }
);

// Prevent duplicate sequence numbers within a test
milkTestReadingSchema.index(
    {
        testId: 1,
        sequenceNumber: 1
    },
    {
        unique: true
    }
);

// Retrieve all readings for a farmer's test
milkTestReadingSchema.index({
    farmerId: 1,
    testId: 1
});

const MilkTestReading = mongoose.model(
    "MilkTestReading",
    milkTestReadingSchema
);

module.exports = MilkTestReading;
