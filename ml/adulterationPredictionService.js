
const tf = require("@tensorflow/tfjs");
const fs = require("fs");
const path = require("path");

const {
    SPECTRAL_COLUMNS,
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

    if (
        savedData.inputFeatures !== 18 ||
        savedData.outputClasses !== 7 ||
        !Array.isArray(savedData.weights) ||
        !savedData.scaler
    ) {
        throw new Error("Invalid adulteration model file.");
    }

    const model = createAdulterationModel();

    const modelWeights = savedData.weights.map(
        weight => tf.tensor(weight)
    );

    try {
        model.setWeights(modelWeights);
    } finally {
        modelWeights.forEach(weight => weight.dispose());
    }

    adulterationModel = model;
    modelMetadata = savedData;

    console.log("Adulteration model loaded successfully.");

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
            throw new Error("Invalid spectral sensor value.");
        }

        const number = Number(value);

        if (!Number.isFinite(number)) {
            throw new Error("Spectral values must be finite numbers.");
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
        predictionTensor = adulterationModel.predict(inputTensor);

        const probabilities = Array.from(
            await predictionTensor.data()
        );

        let predictedIndex = 0;

        probabilities.forEach((probability, index) => {
            if (probability > probabilities[predictedIndex]) {
                predictedIndex = index;
            }
        });

        // Model classes are internally 0-6.
        // Original dataset labels are 1-7.
        const predictedLabel = predictedIndex + 1;

        const adulterantType =
            modelMetadata.labelMapping[String(predictedLabel)];

        const confidence = probabilities[predictedIndex];

        const classProbabilities = {};

        probabilities.forEach((probability, index) => {
            const label = index + 1;

            classProbabilities[label] = {
                adulterantType:
                    modelMetadata.labelMapping[String(label)],

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
                adulterantType,
                confidence: Number(confidence.toFixed(6)),
                confidencePercentage: Number(
                    (confidence * 100).toFixed(2)
                )
            },

            probabilities: classProbabilities,

            model: {
                name: modelMetadata.modelName,
                version: modelMetadata.version
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

        console.log("Adulteration model disposed.");
    }
}

module.exports = {
    loadAdulterationModel,
    predictAdulteration,
    disposeAdulterationModel
};
