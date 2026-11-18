
const tf = require("@tensorflow/tfjs");
const fs = require("fs");
const path = require("path");

const {
    loadAdulterationDataset,
    fitStandardScaler,
    transformData
} = require("./datasetService");

const {
    createAdulterationModel
} = require("./adulterationModel");

const MODEL_DIRECTORY = path.join(
    __dirname,
    "trained-models"
);

const MODEL_PATH = path.join(
    MODEL_DIRECTORY,
    "adulteration-model.json"
);

// Reproducible random generator
function createRandomGenerator(seed = 42) {
    let value = seed;

    return function () {
        value = (value * 16807) % 2147483647;
        return (value - 1) / 2147483646;
    };
}

function shuffleArray(array, random) {
    const result = [...array];

    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));

        [result[i], result[j]] = [
            result[j],
            result[i]
        ];
    }

    return result;
}

// Stratified 80:20 split
function stratifiedSplit(features, labels) {
    const random = createRandomGenerator();

    const classGroups = {};

    labels.forEach((label, index) => {
        if (!classGroups[label]) {
            classGroups[label] = [];
        }

        classGroups[label].push(index);
    });

    const trainIndices = [];
    const validationIndices = [];

    Object.values(classGroups).forEach(indices => {
        const shuffled = shuffleArray(indices, random);

        const validationCount = Math.max(
            1,
            Math.floor(shuffled.length * 0.2)
        );

        validationIndices.push(
            ...shuffled.slice(0, validationCount)
        );

        trainIndices.push(
            ...shuffled.slice(validationCount)
        );
    });

    return {
        xTrain: trainIndices.map(i => features[i]),
        yTrain: trainIndices.map(i => labels[i]),

        xValidation: validationIndices.map(i => features[i]),
        yValidation: validationIndices.map(i => labels[i])
    };
}

// Dynamic confusion matrix
function calculateConfusionMatrix(actual, predicted, classCount) {
    const matrix = Array.from(
        { length: classCount },
        () => Array(classCount).fill(0)
    );

    actual.forEach((actualLabel, index) => {
        matrix[actualLabel][predicted[index]]++;
    });

    return matrix;
}

// Save weights and preprocessing information
async function saveModel(
    model,
    scaler,
    validationAccuracy,
    classCount,
    labelMapping
) {
    if (!fs.existsSync(MODEL_DIRECTORY)) {
        fs.mkdirSync(MODEL_DIRECTORY, {
            recursive: true
        });
    }

    const weights = await Promise.all(
        model.getWeights().map(weight => weight.array())
    );

    const modelData = {
        modelName: "Milk Adulteration Classification",
        version: "3.0.0",
        createdAt: new Date().toISOString(),

        inputFeatures: 18,
        outputClasses: classCount,

        architecture: {
            hiddenLayers: [64, 32],
            activation: "relu",
            outputActivation: "softmax",
            dropout: 0.2
        },

        weights,
        scaler,
        labelMapping,
        validationAccuracy
    };

    fs.writeFileSync(
        MODEL_PATH,
        JSON.stringify(modelData, null, 2)
    );

    console.log("\nModel saved:", MODEL_PATH);
}

// Main training function
async function trainAdulterationModel() {
    let model;

    let xTrainTensor;
    let yTrainTensor;
    let xValidationTensor;
    let yValidationTensor;

    let predictionTensor;
    let evaluationTensors = [];

    try {
        console.log("\n================================");
        console.log("ADULTERATION MODEL TRAINING");
        console.log("================================");

        // 1. Load dataset
        const dataset = loadAdulterationDataset();

        const classCount = dataset.classCount;
        const labelMapping = dataset.labelMapping;

        console.log("Total samples:", dataset.sampleCount);
        console.log("Features:", dataset.featureNames.length);
        console.log("Classes:", classCount);

        console.log("\nLabel Mapping:");
        console.log(labelMapping);

        // Validate labels
        const invalidLabels = dataset.labels.filter(
            label =>
                !Number.isInteger(label) ||
                label < 0 ||
                label >= classCount
        );

        if (invalidLabels.length > 0) {
            throw new Error(
                "Dataset contains invalid class labels."
            );
        }

        // 2. Split dataset
        const split = stratifiedSplit(
            dataset.features,
            dataset.labels
        );

        console.log(
            "\nTraining samples:",
            split.xTrain.length
        );

        console.log(
            "Validation samples:",
            split.xValidation.length
        );

        // 3. Normalize using training data only
        const scaler = fitStandardScaler(split.xTrain);

        const xTrain = transformData(
            split.xTrain,
            scaler
        );

        const xValidation = transformData(
            split.xValidation,
            scaler
        );

        // 4. Convert to tensors
        xTrainTensor = tf.tensor2d(xTrain);

        const yTrainIndexTensor = tf.tensor1d(
            split.yTrain,
            "int32"
        );

        yTrainTensor = tf.oneHot(
            yTrainIndexTensor,
            classCount
        );

        yTrainIndexTensor.dispose();

        xValidationTensor = tf.tensor2d(xValidation);

        const yValidationIndexTensor = tf.tensor1d(
            split.yValidation,
            "int32"
        );

        yValidationTensor = tf.oneHot(
            yValidationIndexTensor,
            classCount
        );

        yValidationIndexTensor.dispose();

        // 5. Create model
        model = createAdulterationModel();

        const modelOutputClasses = model.outputs[0].shape.at(-1);

        if (modelOutputClasses !== classCount) {
            throw new Error(
                `Model output has ${modelOutputClasses} classes, ` +
                `but dataset contains ${classCount} classes.`
            );
        }

        model.summary();

        // 6. Train
        console.log("\nTraining started...\n");

        const history = await model.fit(
            xTrainTensor,
            yTrainTensor,
            {
                epochs: 100,
                batchSize: 32,
                shuffle: true,

                validationData: [
                    xValidationTensor,
                    yValidationTensor
                ],

                callbacks: {
                    onEpochEnd: async (epoch, logs) => {
                        const accuracy =
                            logs.acc ?? logs.accuracy ?? 0;

                        const validationAccuracy =
                            logs.val_acc ?? logs.val_accuracy ?? 0;

                        console.log(
                            `Epoch ${epoch + 1}/100 | ` +
                            `Loss: ${logs.loss.toFixed(4)} | ` +
                            `Accuracy: ${(accuracy * 100).toFixed(2)}% | ` +
                            `Val Loss: ${logs.val_loss.toFixed(4)} | ` +
                            `Val Accuracy: ${(validationAccuracy * 100).toFixed(2)}%`
                        );
                    }
                }
            }
        );

        // 7. Evaluate
        const evaluation = model.evaluate(
            xValidationTensor,
            yValidationTensor
        );

        evaluationTensors = Array.isArray(evaluation)
            ? evaluation
            : [evaluation];

        const evaluationValues = await Promise.all(
            evaluationTensors.map(tensor => tensor.data())
        );

        const validationLoss = evaluationValues[0][0];
        const validationAccuracy = evaluationValues[1][0];

        console.log("\n================================");
        console.log("VALIDATION RESULTS");
        console.log("================================");

        console.log(
            "Validation Loss:",
            validationLoss.toFixed(4)
        );

        console.log(
            "Validation Accuracy:",
            (validationAccuracy * 100).toFixed(2) + "%"
        );

        // 8. Generate predictions
        predictionTensor = model.predict(xValidationTensor);

        const predictionValues = await predictionTensor.array();

        const predictedLabels = predictionValues.map(
            probabilities => {
                let maxIndex = 0;

                probabilities.forEach((value, index) => {
                    if (value > probabilities[maxIndex]) {
                        maxIndex = index;
                    }
                });

                return maxIndex;
            }
        );

        const confusionMatrix = calculateConfusionMatrix(
            split.yValidation,
            predictedLabels,
            classCount
        );

        console.log("\nConfusion Matrix:");

        console.table(confusionMatrix);

        // 9. Save model
        await saveModel(
            model,
            scaler,
            validationAccuracy,
            classCount,
            labelMapping
        );

        const trainingAccuracy =
            history.history.acc?.at(-1) ??
            history.history.accuracy?.at(-1) ??
            0;

        console.log(
            "\nFinal Training Accuracy:",
            (trainingAccuracy * 100).toFixed(2) + "%"
        );

        console.log("\nTraining completed successfully!");

    } catch (error) {
        console.error(
            "\nAdulteration training error:",
            error
        );

        throw error;

    } finally {
        if (xTrainTensor) xTrainTensor.dispose();
        if (yTrainTensor) yTrainTensor.dispose();
        if (xValidationTensor) xValidationTensor.dispose();
        if (yValidationTensor) yValidationTensor.dispose();

        if (predictionTensor) predictionTensor.dispose();

        evaluationTensors.forEach(tensor => tensor.dispose());

        if (model) model.dispose();
    }
}

trainAdulterationModel()
    .then(() => {
        console.log("\nAdulteration training process finished.");
        process.exit(0);
    })
    .catch(() => {
        process.exit(1);
    });
