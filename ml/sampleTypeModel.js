
const tf = require("@tensorflow/tfjs");

const createSampleTypeModel = () => {
    const model = tf.sequential();

    // Input: 18 spectral sensor values
    model.add(
        tf.layers.dense({
            inputShape: [18],
            units: 64,
            activation: "relu",
            kernelInitializer: "heNormal"
        })
    );

    model.add(
        tf.layers.dropout({
            rate: 0.2
        })
    );

    model.add(
        tf.layers.dense({
            units: 32,
            activation: "relu",
            kernelInitializer: "heNormal"
        })
    );

    model.add(
        tf.layers.dropout({
            rate: 0.2
        })
    );

    // Output: Milk, Pure Water, Empty Glass
    model.add(
        tf.layers.dense({
            units: 3,
            activation: "softmax"
        })
    );

    model.compile({
        optimizer: tf.train.adam(0.001),
        loss: "categoricalCrossentropy",
        metrics: ["accuracy"]
    });

    return model;
};

module.exports = {
    createSampleTypeModel
};
