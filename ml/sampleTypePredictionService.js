
const fs = require("fs");
const path = require("path");
const tf = require("@tensorflow/tfjs");

const { transformData } = require("./datasetService");
const { createSampleTypeModel } = require("./sampleTypeModel");

// ============================================
// MODEL CONFIGURATION
// ============================================

const MODEL_PATH = path.join(
    __dirname,
    "trained-models",
    "sample-type-model.json"
);

const EXPECTED_INPUT_FEATURES = 18;
const EXPECTED_OUTPUT_CLASSES = 3;

const EXPECTED_SAMPLE_TYPES = [
    "Milk",
    "Pure Water",
    "Empty Glass"
];

let model = null;
let modelData = null;

// ============================================
// LOAD TRAINED SAMPLE TYPE MODEL
// ============================================

async function loadSampleTypeModel() {
    try {
        // Return already loaded model
        if (model && modelData) {
            return true;
        }

        if (!fs.existsSync(MODEL_PATH)) {
            throw new Error(
                "Sample type model not found. Train the model first."
            );
        }

        // Read custom JSON model
        const savedData = JSON.parse(
            fs.readFileSync(MODEL_PATH, "utf-8")
        );

        // Validate model configuration
        if (
            savedData.inputFeatures !== EXPECTED_INPUT_FEATURES ||
            savedData.outputClasses !== EXPECTED_OUTPUT_CLASSES
        ) {
            throw new Error(
                "Invalid sample type model configuration."
            );
        }

        // Validate embedded weights
        if (
            !Array.isArray(savedData.weights) ||
            savedData.weights.length === 0
        ) {
            throw new Error(
                "Trained model weights are missing."
            );
        }

        // Validate scaler
        if (
            !savedData.scaler ||
            !Array.isArray(savedData.scaler.means) ||
            !Array.isArray(savedData.scaler.standardDeviations) ||
            savedData.scaler.means.length !== EXPECTED_INPUT_FEATURES ||
            savedData.scaler.standardDeviations.length !== EXPECTED_INPUT_FEATURES
        ) {
            throw new Error(
                "Invalid sample type model scaler configuration."
            );
        }

        // Validate label mapping
        if (!savedData.labelMapping) {
            throw new Error(
                "Sample type label mapping is missing."
            );
        }

        for (
            let index = 0;
            index < EXPECTED_OUTPUT_CLASSES;
            index++
        ) {
            const label =
                savedData.labelMapping[String(index)];

            if (
                typeof label !== "string" ||
                !EXPECTED_SAMPLE_TYPES.includes(label)
            ) {
                throw new Error(
                    `Invalid sample type label mapping for class ${index}.`
                );
            }
        }

        // Create model architecture
        const newModel = createSampleTypeModel();

        // Convert embedded arrays into TensorFlow tensors
        const weights = savedData.weights.map(weight =>
            tf.tensor(weight)
        );

        try {
            // Restore trained weights
            newModel.setWeights(weights);
        } finally {
            // Dispose temporary tensors
            weights.forEach(weight => weight.dispose());
        }

        // Verify model input and output shapes
        if (
            newModel.inputs[0].shape[1] !== EXPECTED_INPUT_FEATURES ||
            newModel.outputs[0].shape[1] !== EXPECTED_OUTPUT_CLASSES
        ) {
            newModel.dispose();

            throw new Error(
                "Sample type model architecture does not match expected input/output dimensions."
            );
        }

        model = newModel;
        modelData = savedData;

        console.log(
            "============================================"
        );

        console.log(
            "Sample Type Model Loaded Successfully"
        );

        console.log(
            "Model:",
            savedData.modelName
        );

        console.log(
            "Version:",
            savedData.version
        );

        console.log(
            "Input Features:",
            savedData.inputFeatures
        );

        console.log(
            "Output Classes:",
            savedData.outputClasses
        );

        console.log(
            "============================================"
        );

        return true;

    } catch (error) {
        console.error(
            "Sample Type Model Loading Error:",
            error.message
        );

        throw error;
    }
}

// ============================================
// PREDICT SAMPLE TYPE
// ============================================

async function predictSampleType(spectralValues) {
    let inputTensor = null;
    let predictionTensor = null;

    try {
        // Load model if not already loaded
        await loadSampleTypeModel();

        // Validate input
        if (
            !Array.isArray(spectralValues) ||
            spectralValues.length !== EXPECTED_INPUT_FEATURES
        ) {
            throw new Error(
                "Invalid input. Expected exactly 18 spectral values."
            );
        }

        // Convert input values to numbers
        const numericValues = spectralValues.map(Number);

        // Validate numeric values
        if (
            numericValues.some(value =>
                !Number.isFinite(value)
            )
        ) {
            throw new Error(
                "Spectral values must contain only valid numbers."
            );
        }

        // ========================================
        // NORMALIZE INPUT DATA
        // ========================================

        const normalizedValues = transformData(
            [numericValues],
            modelData.scaler
        );

        if (
            !Array.isArray(normalizedValues) ||
            normalizedValues.length !== 1 ||
            normalizedValues[0].length !== EXPECTED_INPUT_FEATURES ||
            normalizedValues[0].some(value =>
                !Number.isFinite(value)
            )
        ) {
            throw new Error(
                "Invalid normalized spectral input."
            );
        }

        // ========================================
        // CREATE INPUT TENSOR
        // ========================================

        inputTensor = tf.tensor2d(
            normalizedValues,
            [1, EXPECTED_INPUT_FEATURES]
        );

        // ========================================
        // RUN SAMPLE TYPE PREDICTION
        // ========================================

        predictionTensor = model.predict(inputTensor);

        // Validate prediction output
        if (
            Array.isArray(predictionTensor) ||
            predictionTensor.shape[0] !== 1 ||
            predictionTensor.shape[1] !== EXPECTED_OUTPUT_CLASSES
        ) {
            throw new Error(
                "Invalid sample type model output. Expected shape [1, 3]."
            );
        }

        const probabilities = Array.from(
            await predictionTensor.data()
        );

        // Validate probabilities
        if (
            probabilities.length !== EXPECTED_OUTPUT_CLASSES ||
            probabilities.some(value =>
                !Number.isFinite(value) ||
                value < 0 ||
                value > 1
            )
        ) {
            throw new Error(
                "Sample type model returned invalid probabilities."
            );
        }

        // ========================================
        // IDENTIFY PREDICTED CLASS
        // ========================================

        let predictedIndex = 0;

        probabilities.forEach((probability, index) => {
            if (
                probability >
                probabilities[predictedIndex]
            ) {
                predictedIndex = index;
            }
        });

        const sampleType =
            modelData.labelMapping[String(predictedIndex)];

        if (!sampleType) {
            throw new Error(
                `Invalid sample type mapping for class ${predictedIndex}.`
            );
        }

        const confidence =
            probabilities[predictedIndex];

        // ========================================
        // BUILD CLASS PROBABILITIES
        // ========================================

        const probabilityDetails = {};

        Object.entries(modelData.labelMapping).forEach(
            ([index, label]) => {

                const probability =
                    probabilities[Number(index)];

                probabilityDetails[label] = {
                    probability: Number(
                        probability.toFixed(6)
                    ),

                    confidencePercentage: Number(
                        (probability * 100).toFixed(2)
                    )
                };
            }
        );

        // ========================================
        // BUILD PREDICTION RESPONSE
        // ========================================

        const requiresMilk =
            sampleType !== "Milk";

        const message = requiresMilk
            ? "Please add milk to the glass."
            : "Milk sample detected.";

        const result = {
            success: true,

            prediction: {
                sampleType,

                confidence: Number(
                    confidence.toFixed(6)
                ),

                confidencePercentage: Number(
                    (confidence * 100).toFixed(2)
                ),

                requiresMilk,

                message
            },

            probabilities: probabilityDetails,

            model: {
                name: modelData.modelName,
                version: modelData.version
            }
        };

        console.log(
            "============================================"
        );

        console.log(
            "SAMPLE TYPE PREDICTION"
        );

        console.log(
            "Detected:",
            sampleType
        );

        console.log(
            "Confidence:",
            result.prediction.confidencePercentage + "%"
        );

        console.log(
            "Message:",
            message
        );

        console.log(
            "============================================"
        );

        return result;

    } catch (error) {
        console.error(
            "Sample Type Prediction Error:",
            error.message
        );

        throw error;

    } finally {
        // Release TensorFlow memory
        if (inputTensor) {
            inputTensor.dispose();
        }

        if (predictionTensor) {
            predictionTensor.dispose();
        }
    }
}

// ============================================
// EXPORT FUNCTIONS
// ============================================

module.exports = {
    loadSampleTypeModel,
    predictSampleType
};
