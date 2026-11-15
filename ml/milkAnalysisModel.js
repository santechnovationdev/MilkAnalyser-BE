
const tf = require("@tensorflow/tfjs");

const createMilkAnalysisModel = () => {
    const model = tf.sequential();

    model.add(
        tf.layers.dense({
            inputShape: [18],
            units: 64,
            activation: "relu",
            kernelInitializer: "heNormal",
        })
    );

    model.add(tf.layers.dropout({ rate: 0.2 }));

    model.add(
        tf.layers.dense({
            units: 32,
            activation: "relu",
            kernelInitializer: "heNormal",
        })
    );

    model.add(
        tf.layers.dense({
            units: 16,
            activation: "relu",
        })
    );

    // Three regression outputs:
    // Fat, SNF, Water
    model.add(
        tf.layers.dense({
            units: 3,
            activation: "linear",
        })
    );

    model.compile({
        optimizer: tf.train.adam(0.001),
        loss: "meanSquaredError",
        metrics: ["mae"],
    });

    return model;
};

module.exports = { createMilkAnalysisModel };
