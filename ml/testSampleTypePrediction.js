
"use strict";

const {
    loadSampleTypeDataset
} = require("./datasetService");

const {
    predictSampleType
} = require("./sampleTypePredictionService");

// ============================================
// TEST SAMPLE TYPE PREDICTION
// ============================================

async function testSampleTypePrediction() {
    try {
        console.log("\n====================================");
        console.log(" SAMPLE TYPE MODEL TEST");
        console.log("====================================\n");

        // Load actual Excel dataset.
        const dataset = loadSampleTypeDataset();

        console.log("Dataset loaded successfully.");
        console.log("Total samples:", dataset.sampleCount);
        console.log("Features:", dataset.featureNames.length);

        // Test one sample from each class.
        const sampleTypes = [
            "Milk",
            "Pure Water",
            "Empty Glass"
        ];

        let passed = 0;
        let failed = 0;

        for (const expectedType of sampleTypes) {
            const sampleIndex = dataset.originalLabels.findIndex(
                label => label === expectedType
            );

            if (sampleIndex === -1) {
                console.log(`\nSample not found: ${expectedType}`);
                failed++;
                continue;
            }

            const spectralValues = dataset.features[sampleIndex];

            console.log("\n------------------------------------");
            console.log(`Testing: ${expectedType}`);
            console.log("------------------------------------");

            const result = await predictSampleType(spectralValues);

            if (!result?.success || !result.prediction) {
                throw new Error(
                    `Prediction failed for ${expectedType}`
                );
            }

            const predictedType = result.prediction.sampleType;
            const confidence = result.prediction.confidencePercentage;

            console.log("Actual Type    :", expectedType);
            console.log("Predicted Type :", predictedType);
            console.log("Confidence     :", `${confidence}%`);
            console.log("Requires Milk  :", result.prediction.requiresMilk);
            console.log("Message        :", result.prediction.message);

            if (predictedType === expectedType) {
                console.log("Test Result    : PASSED");
                passed++;
            } else {
                console.log("Test Result    : FAILED");
                failed++;
            }
        }

        console.log("\n====================================");
        console.log(" TEST SUMMARY");
        console.log("====================================");
        console.log("Passed:", passed);
        console.log("Failed:", failed);
        console.log("Total :", sampleTypes.length);
        console.log("====================================\n");

        if (failed > 0) {
            process.exitCode = 1;
        }

    } catch (error) {
        console.error("\nSample type test failed:");
        console.error(error.message);
        process.exitCode = 1;
    }
}

testSampleTypePrediction();
