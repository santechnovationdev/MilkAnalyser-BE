
const express = require("express");
const router = express.Router();
const mqtt = require("mqtt");

const client = mqtt.connect(`mqtts://${process.env.MQTT_HOST}:8883`,
    {
        clientId: "milkanalyser_backend_01",
        username: process.env.MQTT_USERNAME,
        password: process.env.MQTT_PASSWORD,
        protocolVersion: 5,
        reconnectPeriod: 5000,
        connectTimeout: 30000,
    }
);

// MQTT Connected
client.on("connect", () => {
    console.log("EMQX Connected Successfully");

    client.subscribe("milk/analyser/data",
        { qos: 1 },
        (err) => {
            if (err) {
                console.log("Subscribe Error:", err.message);
            } else {
                console.log("Subscribed: milk/analyzer/data");
            }
        }
    );
});

// MQTT Error
client.on("error", (err) => {
    console.log("MQTT Error:", err.message);
});

// Receive Hardware / MQTTX Data
client.on("message", (topic, message) => {
    try {
        const data = JSON.parse(message.toString());

        console.log("Received Topic:", topic);
        console.log("Received Milk Data:", data);

        // TODO: Save data to MongoDB
        res.status(200).json({
            success: true,
            message: "Hardware Data Received Successfully",
            receivedData: data
        });

    } catch (error) {
        console.log("Invalid MQTT JSON:", error.message);
    }
});

// React Start Button -> Backend -> Hardware
router.post("/milk/analyser/start", (req, res) => {

    const command = {
        deviceId: "milk_analyzer_01",
        command: "START",
        timestamp: new Date().toISOString()
    };

    if (!client.connected) {
        return res.status(503).json({
            success: false,
            message: "MQTT Broker Not Connected"
        });
    }

    client.publish("milk/analyser/command",
        JSON.stringify(command),
        { qos: 1 },
        (err) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: "Command Publish Failed"
                });
            }

            return res.status(200).json({
                success: true,
                message: "Milk Analyzer Start Command Sent",
                data: command
            });
        }
    );
});

module.exports = router;
