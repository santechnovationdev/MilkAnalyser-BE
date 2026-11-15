const {
    getDatasetSummary,
    loadAdulterationDataset,
    loadMilkAnalysisDataset,
    fitStandardScaler,
    transformData
} = require("./datasetService");

try {
    console.log("\n========== DATASET SUMMARY ==========\n");

    console.log(
        JSON.stringify(getDatasetSummary(), null, 4)
    );

    const adulteration = loadAdulterationDataset();

    const adulterationScaler = fitStandardScaler(
        adulteration.features
    );

    const normalizedAdulteration = transformData(
        adulteration.features,
        adulterationScaler
    );

    console.log("\nAdulteration dataset:");
    console.log("Samples:", adulteration.sampleCount);
    console.log("Input features:", normalizedAdulteration[0]);
    console.log("Class index:", adulteration.labels[0]);

    const analysis = loadMilkAnalysisDataset();

    const analysisScaler = fitStandardScaler(
        analysis.features
    );

    const normalizedAnalysis = transformData(
        analysis.features,
        analysisScaler
    );

    console.log("\nMilk analysis dataset:");
    console.log("Samples:", analysis.sampleCount);
    console.log("Input features:", normalizedAnalysis[0]);
    console.log("Target values:", analysis.targets[0]);

    console.log("\nDataset loading and preprocessing successful!");

} catch (error) {
    console.error("Dataset loading failed:", error.message);
}