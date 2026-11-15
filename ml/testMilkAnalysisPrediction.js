
const {
    loadMilkAnalysisDataset,
} = require("./datasetService");

const {
    loadMilkAnalysisModel,
    predictMilkAnalysis,
} = require("./milkAnalysisPredictionService");

async function testPrediction() {
    try {
        console.log("\nLoading milk analysis model...");

        await loadMilkAnalysisModel();

        const dataset = loadMilkAnalysisDataset();

        // Test using the first dataset sample
        const spectralValues = dataset.features[0];

        console.log("\nInput spectral values:");
        console.log(spectralValues);

        const result = await predictMilkAnalysis(
            spectralValues
        );

        console.log("\n========== MILK ANALYSIS RESULT ==========");

        console.log("Fat:", result.prediction.fat);
        console.log("SNF:", result.prediction.snf);
        console.log("Water:", result.prediction.water);

        console.log("\nComplete result:");
        console.log(JSON.stringify(result, null, 4));

        console.log("\nPrediction test successful!");

    } catch (error) {
        console.error("Prediction test failed:", error);
    }
}

testPrediction();
