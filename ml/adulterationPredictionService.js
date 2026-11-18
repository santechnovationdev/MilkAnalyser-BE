
const tf = require("@tensorflow/tfjs");
const fs = require("fs");
const path = require("path");

const {
    transformData
} = require("./datasetService");

const {
    createAdulterationModel
} = require("./adulterationModel");

const MODEL_PATH = path.join(
    __dirname,
    "trained-models",
    "adulteration-model.json"
);

let adulterationModel = null;
let modelMetadata = null;

// Load model only once.
async function loadAdulterationModel() {
    if (adulterationModel) {
        return adulterationModel;
    }

    if (!fs.existsSync(MODEL_PATH)) {
        throw new Error(
            "Adulteration model not found. Train the model first."
        );
    }

    const savedData = JSON.parse(
        fs.readFileSync(MODEL_PATH, "utf8")
    );

    // Validate model metadata.
    if (
        savedData.inputFeatures !== 18 ||
        savedData.outputClasses !== 10 ||
        !Array.isArray(savedData.weights) ||
        !savedData.scaler ||
        !savedData.labelMapping
    ) {
        throw new Error(
            "Invalid adulteration model file. Expected 18 features and 10 classes."
        );
    }

    // Validate all 10 class mappings.
    for (let index = 0; index < 10; index++) {
        if (!savedData.labelMapping[String(index)]) {
            throw new Error(
                `Missing label mapping for class index ${index}.`
            );
        }
    }

    const model = createAdulterationModel();

    const modelWeights = savedData.weights.map(
        weight => tf.tensor(weight)
    );

    try {
        model.setWeights(modelWeights);

        const outputClasses = model.outputs[0].shape.at(-1);

        if (outputClasses !== savedData.outputClasses) {
            throw new Error(
                `Model architecture has ${outputClasses} outputs, ` +
                `but saved metadata specifies ${savedData.outputClasses}.`
            );
        }

    } catch (error) {
        model.dispose();
        throw error;

    } finally {
        modelWeights.forEach(weight => weight.dispose());
    }

    adulterationModel = model;
    modelMetadata = savedData;

    console.log(
        "Adulteration model loaded successfully."
    );

    console.log(
        "Model version:",
        modelMetadata.version
    );

    console.log(
        "Output classes:",
        modelMetadata.outputClasses
    );

    return adulterationModel;
}

// Validate incoming sensor values.
function validateSpectralValues(spectralValues) {
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
            value === null ||
            value === undefined ||
            String(value).trim() === ""
        ) {
            throw new Error(
                "Invalid spectral sensor value."
            );
        }

        const number = Number(value);

        if (!Number.isFinite(number)) {
            throw new Error(
                "Spectral values must be finite numbers."
            );
        }

        return number;
    });

    return values;
}

// Predict adulterant type.
async function predictAdulteration(spectralValues) {
    await loadAdulterationModel();

    const validatedValues = validateSpectralValues(
        spectralValues
    );

    // Normalize using the scaler saved during training.
    const normalizedValues = transformData(
        [validatedValues],
        modelMetadata.scaler
    );

    const inputTensor = tf.tensor2d(
        normalizedValues,
        [1, 18]
    );

    let predictionTensor;

    try {
        predictionTensor = adulterationModel.predict(
            inputTensor
        );

        const probabilities = Array.from(
            await predictionTensor.data()
        );

        if (
            probabilities.length !==
            modelMetadata.outputClasses
        ) {
            throw new Error(
                "Prediction output does not match the saved model class count."
            );
        }

        // Find the highest probability.
        let predictedIndex = 0;

        probabilities.forEach((probability, index) => {
            if (
                probability >
                probabilities[predictedIndex]
            ) {
                predictedIndex = index;
            }
        });

        // Internal model indices: 0-9.
        // Original dataset labels: 1-10.
        const predictedLabel = predictedIndex + 1;

        // Mapping uses internal zero-based indices.
        const adulterantType =
            modelMetadata.labelMapping[String(predictedIndex)];

        const confidence = probabilities[predictedIndex];

        // Generate probabilities for all 10 classes.
        const classProbabilities = {};

        probabilities.forEach((probability, index) => {
            const originalLabel = index + 1;

            classProbabilities[originalLabel] = {
                adulterantType:
                    modelMetadata.labelMapping[String(index)],

                probability: Number(
                    probability.toFixed(6)
                ),

                confidencePercentage: Number(
                    (probability * 100).toFixed(2)
                )
            };
        });

        return {
            success: true,

            prediction: {
                label: predictedLabel,
                classIndex: predictedIndex,
                adulterantType,
                confidence: Number(
                    confidence.toFixed(6)
                ),
                confidencePercentage: Number(
                    (confidence * 100).toFixed(2)
                )
            },

            probabilities: classProbabilities,

            model: {
                name: modelMetadata.modelName,
                version: modelMetadata.version,
                outputClasses: modelMetadata.outputClasses
            }
        };

    } finally {
        inputTensor.dispose();

        if (predictionTensor) {
            predictionTensor.dispose();
        }
    }
}

// Release model resources if needed.
function disposeAdulterationModel() {
    if (adulterationModel) {
        adulterationModel.dispose();

        adulterationModel = null;
        modelMetadata = null;

        console.log(
            "Adulteration model disposed."
        );
    }
}

module.exports = {
    loadAdulterationModel,
    predictAdulteration,
    disposeAdulterationModel
};
