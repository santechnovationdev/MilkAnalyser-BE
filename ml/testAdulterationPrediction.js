
const {
    loadAdulterationDataset
} = require("./datasetService");

const {
    loadAdulterationModel,
    predictAdulteration
} = require("./adulterationPredictionService");

async function testPrediction() {
    try {
        console.log("\nLoading adulteration model...");

        await loadAdulterationModel();

        // Get one sample from the existing dataset.
        const dataset = loadAdulterationDataset();

        const spectralValues = dataset.features[0];

        console.log("\nInput spectral values:");
        console.log(spectralValues);

        const result = await predictAdulteration(
            spectralValues
        );

        console.log("\n========== PREDICTION RESULT ==========");

        console.log(
            JSON.stringify(result, null, 4)
        );

        console.log("\nPrediction test successful!");

    } catch (error) {
        console.error("Prediction test failed:", error);
    }
}

testPrediction();
