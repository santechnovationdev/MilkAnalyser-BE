const {
    loadAdulterationDataset,
    getDatasetSummary
} = require("./ml/datasetService");

try {
    console.log("\n========== ADULTERATION DATASET TEST ==========\n");

    const dataset = loadAdulterationDataset();

    console.log("Total Samples:", dataset.sampleCount);
    console.log("Total Features:", dataset.featureNames.length);
    console.log("Total Classes:", dataset.classCount);

    console.log("\nLabel Mapping:");

    Object.entries(dataset.labelMapping).forEach(([label, name]) => {
        console.log(`${Number(label) + 1} - ${name}`);
    });

    console.log("\nClass Distribution:");

    const distribution = {};

    dataset.originalLabels.forEach(label => {
        distribution[label] = (distribution[label] || 0) + 1;
    });

    console.log(distribution);

    console.log("\nFirst Sample Features:");
    console.log(dataset.features[0]);

    console.log("\nLast Sample Label:");
    console.log(dataset.originalLabels[dataset.originalLabels.length - 1]);

    console.log("\nDataset Summary:");
    console.log(getDatasetSummary());

    console.log("\n========== TEST COMPLETED SUCCESSFULLY ==========\n");

} catch (error) {
    console.error("\nDATASET TEST FAILED:");
    console.error(error.message);
}