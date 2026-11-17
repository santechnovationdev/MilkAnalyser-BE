
const mongoose = require("mongoose");

const milkTestSessionSchema = new mongoose.Schema(
    {
        // MongoDB farmer reference
        farmerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "users",
            required: true,
            index: true
        },

        // Custom farmer ID used by MQTT and frontend
        farmerCustomId: {
            type: String,
            required: true,
            trim: true,
            index: true
        },

        // User who initiated the test (farmer or admin)
        requestedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "users",
            required: true
        },

        requestedByRole: {
            type: String,
            enum: ["farmer", "admin"],
            required: true
        },

        deviceId: {
            type: String,
            required: true,
            default: "san-milk-a84f29/01"
        },

        // 0 = Adulteration, 1 = Analysis
        mode: {
            type: Number,
            enum: [0, 1],
            required: true
        },

        status: {
            type: String,
            enum: [
                "STARTING",
                "RUNNING",
                "STOPPING",
                "PROCESSING",
                "COMPLETED",
                "FAILED"
            ],
            default: "STARTING",
            index: true
        },

        startedAt: {
            type: Date,
            default: null
        },

        stoppedAt: {
            type: Date,
            default: null
        },

        completedAt: {
            type: Date,
            default: null
        },

        totalReadings: {
            type: Number,
            default: 0
        },

        startCommandSentAt: {
            type: Date,
            default: null
        },

        autoStopAt: {
            type: Date,
            default: null,
            index: true
        },
        stopCommandSentAt: {
            type: Date,
            default: null
        },

        lastError: {
            type: String,
            default: null
        }
    },
    {
        timestamps: true
    }
);

// Farmer-specific test history
milkTestSessionSchema.index({
    farmerId: 1,
    createdAt: -1
});

// Custom farmer ID history
milkTestSessionSchema.index({
    farmerCustomId: 1,
    createdAt: -1
});

// Filter tests by mode and status
milkTestSessionSchema.index({
    mode: 1,
    status: 1
});

const MilkTestSession = mongoose.model(
    "MilkTestSession",
    milkTestSessionSchema
);

module.exports = MilkTestSession;
