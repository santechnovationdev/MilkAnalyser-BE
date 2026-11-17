
"use strict";

const {
    loadSampleTypeDataset
} = require("./datasetService");

const {
    predictSampleType
} = require("./sampleTypePredictionService");

const SAMPLE_TYPES = [
    "Milk",
    "Pure Water",
    "Empty Glass"
];

async function evaluateSampleTypeModel() {
    try {
        console.log("\n========================================");
        console.log(" SAMPLE TYPE MODEL EVALUATION");
        console.log("========================================\n");

        const dataset = loadSampleTypeDataset();

        const confusionMatrix = SAMPLE_TYPES.map(() =>
            SAMPLE_TYPES.map(() => 0)
        );

        let correct = 0;
        let incorrect = 0;

        for (let i = 0; i < dataset.sampleCount; i++) {
            const actualType = dataset.originalLabels[i];
            const spectralValues = dataset.features[i];

            const actualIndex = SAMPLE_TYPES.indexOf(actualType);

            if (actualIndex === -1) {
                throw new Error(`Unknown sample type: ${actualType}`);
            }

            const result = await predictSampleType(spectralValues);

            if (!result?.success || !result.prediction) {
                throw new Error(`Prediction failed at sample ${i + 1}`);
            }

            const predictedType = result.prediction.sampleType;
            const predictedIndex = SAMPLE_TYPES.indexOf(predictedType);

            if (predictedIndex === -1) {
                throw new Error(`Unknown predicted type: ${predictedType}`);
            }

            confusionMatrix[actualIndex][predictedIndex]++;

            if (actualType === predictedType) {
                correct++;
            } else {
                incorrect++;
            }

            if ((i + 1) % 100 === 0 || i + 1 === dataset.sampleCount) {
                console.log(
                    `Evaluated ${i + 1}/${dataset.sampleCount} samples`
                );
            }
        }

        const accuracy = (correct / dataset.sampleCount) * 100;

        console.log("\n========================================");
        console.log(" OVERALL RESULTS");
        console.log("========================================");
        console.log("Total Samples :", dataset.sampleCount);
        console.log("Correct       :", correct);
        console.log("Incorrect     :", incorrect);
        console.log("Accuracy      :", `${accuracy.toFixed(2)}%`);

        console.log("\n========================================");
        console.log(" CONFUSION MATRIX");
        console.log("========================================");

        console.log(
            "Actual \\ Predicted".padEnd(22) +
            SAMPLE_TYPES.map(type => type.padStart(15)).join("")
        );

        confusionMatrix.forEach((row, index) => {
            console.log(
                SAMPLE_TYPES[index].padEnd(22) +
                row.map(value => String(value).padStart(15)).join("")
            );
        });

        console.log("\n========================================");
        console.log(" CLASSIFICATION REPORT");
        console.log("========================================");

        for (let i = 0; i < SAMPLE_TYPES.length; i++) {
            const truePositive = confusionMatrix[i][i];

            const falsePositive = confusionMatrix.reduce(
                (sum, row, rowIndex) =>
                    sum + (rowIndex !== i ? row[i] : 0),
                0
            );

            const falseNegative = confusionMatrix[i].reduce(
                (sum, value, columnIndex) =>
                    sum + (columnIndex !== i ? value : 0),
                0
            );

            const precision =
                truePositive + falsePositive === 0
                    ? 0
                    : truePositive / (truePositive + falsePositive);

            const recall =
                truePositive + falseNegative === 0
                    ? 0
                    : truePositive / (truePositive + falseNegative);

            const f1Score =
                precision + recall === 0
                    ? 0
                    : (2 * precision * recall) / (precision + recall);

            console.log(`\n${SAMPLE_TYPES[i]}`);
            console.log(`Precision : ${(precision * 100).toFixed(2)}%`);
            console.log(`Recall    : ${(recall * 100).toFixed(2)}%`);
            console.log(`F1-Score  : ${(f1Score * 100).toFixed(2)}%`);
        }

        console.log("\n========================================");
        console.log(" EVALUATION COMPLETED");
        console.log("========================================\n");

    } catch (error) {
        console.error("\nEvaluation failed:");
        console.error(error);
        process.exitCode = 1;
    }
}

evaluateSampleTypeModel();
