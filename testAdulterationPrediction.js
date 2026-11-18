const {
    loadAdulterationModel,
    predictAdulteration
} = require("./ml/adulterationPredictionService");

async function testPrediction() {
    try {
        console.log("\n========== MODEL TEST ==========\n");

        await loadAdulterationModel();

        // Replace these values with an actual 18-feature
        // spectral reading from your MongoDB dataset.
        const spectralValues = [
            1713.73, 509.02, 1381.62,
            0, 675.92, 927.8,
            98.14, 131.07, 1973.2,
            96.79, 460.48, 30.17,
            142.36, 104.29, 295.24,
            1756.52, 74.53, 21.83
        ];

        const result = await predictAdulteration(
            spectralValues
        );

        console.log("\nPrediction:");
        console.log(result.prediction);

        console.log("\nAll Class Probabilities:");
        console.table(result.probabilities);

        console.log("\nModel Information:");
        console.log(result.model);

        console.log("\nModel prediction test completed!");

    } catch (error) {
        console.error(
            "\nPrediction test failed:",
            error
        );
    }
}

testPrediction();