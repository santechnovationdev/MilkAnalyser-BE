
const tf = require("@tensorflow/tfjs");

const createAdulterationModel = () => {
    const model = tf.sequential();

    // Input layer: 18 spectral sensor values
    model.add(
        tf.layers.dense({
            inputShape: [18],
            units: 64,
            activation: "relu",
            kernelInitializer: "heNormal"
        })
    );

    // Dropout
    model.add(
        tf.layers.dropout({
            rate: 0.2
        })
    );

    // Hidden layer
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

    // Output layer: 9 adulteration classes
    model.add(
        tf.layers.dense({
            units: 10,
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
    createAdulterationModel
};
