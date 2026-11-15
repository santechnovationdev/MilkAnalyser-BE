
const tf = require("@tensorflow/tfjs");
const fs = require("fs");
const path = require("path");

const {
    SPECTRAL_COLUMNS,
    transformData,
    inverseTransformData,
} = require("./datasetService");

const {
    createMilkAnalysisModel,
} = require("./milkAnalysisModel");

const MODEL_PATH = path.join(
    __dirname,
    "trained-models",
    "milk-analysis-model.json"
);

let milkAnalysisModel = null;
let modelMetadata = null;

const loadMilkAnalysisModel = async () => {
    try {
        if (milkAnalysisModel) {
            return milkAnalysisModel;
        }

        if (!fs.existsSync(MODEL_PATH)) {
            throw new Error("Milk analysis model file not found.");
        }

        const savedModel = JSON.parse(
            fs.readFileSync(MODEL_PATH, "utf8")
        );

        if (
            savedModel.inputFeatures !== 18 ||
            !Array.isArray(savedModel.weights) ||
            savedModel.weights.length === 0
        ) {
            throw new Error("Invalid milk analysis model file.");
        }

        if (
            !savedModel.featureScaler ||
            !savedModel.targetScaler
        ) {
            throw new Error("Model scaler information is missing.");
        }

        const model = createMilkAnalysisModel();

        const weightTensors = savedModel.weights.map(weight =>
            tf.tensor(weight)
        );

        try {
            model.setWeights(weightTensors);
        } finally {
            weightTensors.forEach(tensor => tensor.dispose());
        }

        milkAnalysisModel = model;
        modelMetadata = savedModel;

        console.log("Milk analysis model loaded successfully.");

        return milkAnalysisModel;

    } catch (error) {
        console.error("Milk analysis model loading error:", error);
        throw error;
    }
};

const validateSpectralValues = (spectralValues) => {
    if (
        !Array.isArray(spectralValues) ||
        spectralValues.length !== 18
    ) {
        throw new Error(
            "Exactly 18 spectral sensor values are required."
        );
    }

    const values = spectralValues.map(value => {
        if (
            typeof value !== "number" &&
            !(typeof value === "string" && value.trim() !== "")
        ) {
            return NaN;
        }

        return Number(value);
    });

    if (!values.every(Number.isFinite)) {
        throw new Error(
            "All 18 spectral values must be valid finite numbers."
        );
    }

    return values;
};

const predictMilkAnalysis = async (spectralValues) => {
    let inputTensor;
    let predictionTensor;

    try {
        await loadMilkAnalysisModel();

        const validatedValues =
            validateSpectralValues(spectralValues);

        // Normalize incoming spectral readings
        const normalizedFeatures = transformData(
            [validatedValues],
            modelMetadata.featureScaler
        );

        inputTensor = tf.tensor2d(normalizedFeatures);

        // Predict normalized Fat, SNF and Water
        predictionTensor = milkAnalysisModel.predict(inputTensor);

        const normalizedPrediction =
            await predictionTensor.array();

        // Convert to original target units
        const predictions = inverseTransformData(
            normalizedPrediction,
            modelMetadata.targetScaler
        )[0];

        const [fat, snf, water] = predictions;

        return {
            success: true,

            prediction: {
                fat: Number(fat.toFixed(2)),
                snf: Number(snf.toFixed(2)),
                water: Number(water.toFixed(2)),
            },

            model: {
                name: modelMetadata.modelName,
                version: modelMetadata.version,
            },
        };

    } catch (error) {
        console.error("Milk analysis prediction error:", error);
        throw error;

    } finally {
        if (inputTensor) inputTensor.dispose();
        if (predictionTensor) predictionTensor.dispose();
    }
};

const disposeMilkAnalysisModel = () => {
    if (milkAnalysisModel) {
        milkAnalysisModel.dispose();
        milkAnalysisModel = null;
        modelMetadata = null;
    }
};

module.exports = {
    loadMilkAnalysisModel,
    predictMilkAnalysis,
    disposeMilkAnalysisModel,
};
