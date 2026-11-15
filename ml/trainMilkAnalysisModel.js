
const tf = require("@tensorflow/tfjs");
const fs = require("fs");
const path = require("path");

const {
    loadMilkAnalysisDataset,
    fitStandardScaler,
    transformData,
    inverseTransformData,
} = require("./datasetService");

const { createMilkAnalysisModel } = require("./milkAnalysisModel");

const MODEL_DIR = path.join(__dirname, "trained-models");
const MODEL_PATH = path.join(MODEL_DIR, "milk-analysis-model.json");

const TARGET_NAMES = ["Fat", "SNF", "Water"];

const TRAIN_RATIO = 0.8;
const EPOCHS = 150;
const BATCH_SIZE = 32;

function splitDataset(features, targets) {
    const indices = features.map((_, index) => index);

    // Shuffle dataset
    for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    const trainSize = Math.floor(indices.length * TRAIN_RATIO);

    const trainIndices = indices.slice(0, trainSize);
    const validationIndices = indices.slice(trainSize);

    return {
        trainFeatures: trainIndices.map(i => features[i]),
        trainTargets: trainIndices.map(i => targets[i]),

        validationFeatures: validationIndices.map(i => features[i]),
        validationTargets: validationIndices.map(i => targets[i]),
    };
}

function calculateMetrics(actual, predicted) {
    const result = {};

    TARGET_NAMES.forEach((name, index) => {
        const actualValues = actual.map(row => row[index]);
        const predictedValues = predicted.map(row => row[index]);

        const mae = actualValues.reduce(
            (sum, value, i) =>
                sum + Math.abs(value - predictedValues[i]),
            0
        ) / actualValues.length;

        const rmse = Math.sqrt(
            actualValues.reduce(
                (sum, value, i) =>
                    sum + Math.pow(value - predictedValues[i], 2),
                0
            ) / actualValues.length
        );

        result[name] = {
            MAE: Number(mae.toFixed(4)),
            RMSE: Number(rmse.toFixed(4)),
        };
    });

    return result;
}

async function trainMilkAnalysisModel() {
    let model;
    let history;

    try {
        console.log("\nLoading milk analysis dataset...");

        const dataset = loadMilkAnalysisDataset();

        console.log("Total samples:", dataset.sampleCount);
        console.log("Input features:", dataset.featureNames.length);
        console.log("Output targets:", TARGET_NAMES.join(", "));

        const split = splitDataset(
            dataset.features,
            dataset.targets
        );

        console.log("\nTraining samples:", split.trainFeatures.length);
        console.log("Validation samples:", split.validationFeatures.length);

        // Normalize input features using training data only
        const featureScaler = fitStandardScaler(
            split.trainFeatures
        );

        const normalizedTrainFeatures = transformData(
            split.trainFeatures,
            featureScaler
        );

        const normalizedValidationFeatures = transformData(
            split.validationFeatures,
            featureScaler
        );

        // Normalize target values using training data only
        const targetScaler = fitStandardScaler(
            split.trainTargets
        );

        const normalizedTrainTargets = transformData(
            split.trainTargets,
            targetScaler
        );

        const normalizedValidationTargets = transformData(
            split.validationTargets,
            targetScaler
        );

        const xTrain = tf.tensor2d(normalizedTrainFeatures);
        const yTrain = tf.tensor2d(normalizedTrainTargets);

        const xValidation = tf.tensor2d(
            normalizedValidationFeatures
        );

        const yValidation = tf.tensor2d(
            normalizedValidationTargets
        );

        model = createMilkAnalysisModel();

        console.log("\nStarting model training...\n");

        history = await model.fit(xTrain, yTrain, {
            epochs: EPOCHS,
            batchSize: BATCH_SIZE,
            validationData: [xValidation, yValidation],
            shuffle: true,
            callbacks: {
                onEpochEnd: (epoch, logs) => {
                    console.log(
                        `Epoch ${epoch + 1}/${EPOCHS} | ` +
                        `Loss: ${logs.loss.toFixed(4)} | ` +
                        `MAE: ${logs.mae.toFixed(4)} | ` +
                        `Val Loss: ${logs.val_loss.toFixed(4)} | ` +
                        `Val MAE: ${logs.val_mae.toFixed(4)}`
                    );
                },
            },
        });

        // Predict validation values
        const predictionTensor = model.predict(xValidation);

        const normalizedPredictions =
            await predictionTensor.array();

        const actualValues =
            split.validationTargets;

        // Convert predictions back to original units
        const predictedValues = inverseTransformData(
            normalizedPredictions,
            targetScaler
        );

        const metrics = calculateMetrics(
            actualValues,
            predictedValues
        );

        console.log("\n========== VALIDATION RESULTS ==========");

        Object.entries(metrics).forEach(([name, values]) => {
            console.log(`\n${name}:`);
            console.log("MAE:", values.MAE);
            console.log("RMSE:", values.RMSE);
        });

        // Save trained model
        if (!fs.existsSync(MODEL_DIR)) {
            fs.mkdirSync(MODEL_DIR, { recursive: true });
        }

        const weights = await Promise.all(
            model.getWeights().map(weight => weight.array())
        );

        const modelData = {
            modelName: "Milk Analysis Regression Model",
            version: "1.0.0",
            inputFeatures: 18,
            outputTargets: TARGET_NAMES,
            architecture: {
                hiddenLayers: [64, 32, 16],
                outputUnits: 3,
            },
            weights,
            featureScaler,
            targetScaler,
            metrics,
            training: {
                totalSamples: dataset.sampleCount,
                trainingSamples: split.trainFeatures.length,
                validationSamples: split.validationFeatures.length,
                epochs: EPOCHS,
                batchSize: BATCH_SIZE,
            },
            savedAt: new Date().toISOString(),
        };

        fs.writeFileSync(
            MODEL_PATH,
            JSON.stringify(modelData, null, 2)
        );

        console.log("\nModel saved successfully!");
        console.log("Location:", MODEL_PATH);

        xTrain.dispose();
        yTrain.dispose();
        xValidation.dispose();
        yValidation.dispose();
        predictionTensor.dispose();

    } catch (error) {
        console.error("\nMilk analysis training failed:", error);
    } finally {
        if (model) model.dispose();
    }
}

trainMilkAnalysisModel();
