
const mongoose = require("mongoose");

const milkPredictionSchema = new mongoose.Schema(
    {
        testId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "MilkTestSession",
            required: true,
            unique: true
        },

        farmerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "users",
            required: true,
            index: true
        },

        mode: {
            type: Number,
            enum: [0, 1],
            required: true
        },

        // =================================
        // SAMPLE TYPE PREDICTION
        // =================================

        sampleType: {
            type: String,
            enum: ["Milk", "Pure Water", "Empty Glass"],
            default: "Milk"
        },

        sampleTypeConfidence: {
            type: Number,
            default: null,
            min: 0,
            max: 1
        },

        requiresMilk: {
            type: Boolean,
            default: false
        },

        message: {
            type: String,
            default: null
        },

        // =================================
        // MODE 0 - ADULTERATION PREDICTION
        // =================================

        adulterationPresent: {
            type: Boolean,
            default: null
        },

        adulterationType: {
            type: String,
            default: null
        },

        adulterationConfidence: {
            type: Number,
            default: null,
            min: 0,
            max: 1
        },

        // =================================
        // MODE 1 - MILK ANALYSIS PREDICTION
        // =================================

        fat: {
            type: Number,
            default: null
        },

        snf: {
            type: Number,
            default: null
        },

        water: {
            type: Number,
            default: null
        },

        // =================================
        // PREDICTION STATUS
        // =================================

        predictionStatus: {
            type: String,
            enum: ["completed", "failed"],
            default: "completed"
        },

        predictionError: {
            type: String,
            default: null
        },

        modelVersion: {
            type: String,
            default: null
        }
    },
    {
        timestamps: true
    }
);

// =================================
// VALIDATION BASED ON SAMPLE TYPE
// =================================

milkPredictionSchema.pre("validate", function (next) {

    // Failed predictions do not require prediction values.
    if (this.predictionStatus === "failed") {
        return next();
    }

    // =================================
    // NON-MILK SAMPLE VALIDATION
    // =================================

    if (
        this.sampleType === "Pure Water" ||
        this.sampleType === "Empty Glass"
    ) {
        this.requiresMilk = true;

        if (!this.message) {
            this.message = "Please add milk to the glass.";
        }

        // No adulteration or milk analysis prediction
        // should be required for non-milk samples.
        return next();
    }

    // =================================
    // MILK SAMPLE VALIDATION
    // =================================

    this.requiresMilk = false;

    // MODE 0 - Adulteration detection
    if (this.mode === 0) {

        if (
            typeof this.adulterationType !== "string" ||
            !this.adulterationType.trim()
        ) {
            return next(
                new Error(
                    "Adulterant type prediction is required for mode 0."
                )
            );
        }

        if (
            typeof this.adulterationConfidence !== "number" ||
            !Number.isFinite(this.adulterationConfidence) ||
            this.adulterationConfidence < 0 ||
            this.adulterationConfidence > 1
        ) {
            return next(
                new Error(
                    "Valid adulteration confidence is required for mode 0."
                )
            );
        }
    }

    // MODE 1 - Milk analysis
    else if (this.mode === 1) {

        const values = [
            this.fat,
            this.snf,
            this.water
        ];

        if (
            !values.every(
                value =>
                    typeof value === "number" &&
                    Number.isFinite(value)
            )
        ) {
            return next(
                new Error(
                    "Fat, SNF and water predictions are required for mode 1."
                )
            );
        }
    }

    next();
});

// =================================
// INDEXES
// =================================

milkPredictionSchema.index({
    farmerId: 1,
    createdAt: -1
});

const MilkPrediction = mongoose.model(
    "MilkPrediction",
    milkPredictionSchema
);

module.exports = MilkPrediction;
