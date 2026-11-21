
// const mqtt = require("mqtt");
// const mongoose = require("mongoose");

// const SensorData = require("../models/SensorData");

// // -------------------------------------------
// // MQTT CONFIGURATION
// // -------------------------------------------

// const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || `mqtts://${process.env.MQTT_HOST}:8883`;

// const MQTT_TOPIC = "san-milk-a84f29/01/#";

// const SPECTRUM_TOPIC = "san-milk-a84f29/01/result/spectrum";

// const MODE_TOPIC = "san-milk-a84f29/01/control/mode";

// const STATUS_TOPIC = "san-milk-a84f29/01/status";

// // const MQTT_CLIENT_ID = "mqttx_821769b9";
// const MQTT_CLIENT_ID = "milkanalyser_backend_01";

// let mqttClient = null;
// let activeMeasurementId = null;

// let writeQueue = Promise.resolve();
// let collectionOperation = Promise.resolve();

// // -------------------------------------------
// // SERIALIZE START / STOP OPERATIONS
// // -------------------------------------------

// const runCollectionOperation = (operation) => {
//     const result = collectionOperation.then(operation);

//     collectionOperation = result.catch(() => { });

//     return result;
// };

// // -------------------------------------------
// // 1. CONNECT TO MQTT BROKER
// // -------------------------------------------

// const connectMQTT = () => {
//     if (mqttClient) {
//         return mqttClient;
//     }

//     const client = mqtt.connect(MQTT_BROKER_URL, {
//         clientId: MQTT_CLIENT_ID,
//         username: process.env.MQTT_USERNAME || undefined,
//         password: process.env.MQTT_PASSWORD || undefined,
//         protocolVersion: 5,
//         reconnectPeriod: 5000,
//         connectTimeout: 30000,
//         clean: true,
//     });

//     mqttClient = client;

//     client.on("connect", () => {
//         console.log("EMQX MQTT Broker Connected");

//         client.subscribe(MQTT_TOPIC, { qos: 1 }, (error, granted) => {
//             if (error) {
//                 console.error("MQTT Subscribe Error:", error.message);
//                 return;
//             }

//             if (!granted || !granted.some((item) => item.qos !== 128)) {
//                 console.error("MQTT subscription was not granted");
//                 return;
//             }

//             console.log(`Subscribed to: ${MQTT_TOPIC}`);
//         }
//         );
//     });

//     client.on("message", (topic, message) => {
//         if (topic === STATUS_TOPIC) {
//             console.log("Device status:", message.toString());
//             return;
//         }

//         if (topic !== SPECTRUM_TOPIC) {
//             return;
//         }

//         const measurementId = activeMeasurementId;

//         if (!measurementId) {
//             return;
//         }

//         writeQueue = writeQueue
//             .then(() => saveMQTTReading(measurementId, message))
//             .catch((error) => {
//                 console.error("MQTT Save Error:", error.message);
//             });
//     });

//     client.on("error", (error) => {
//         console.error("MQTT Connection Error:", error.message);
//     });

//     client.on("reconnect", () => {
//         console.log("Reconnecting to EMQX...");
//     });

//     client.on("offline", () => {
//         console.log("EMQX MQTT connection offline");
//     });

//     client.on("close", () => {
//         console.log("EMQX MQTT connection closed");
//     });

//     return client;
// };

// // -------------------------------------------
// // 2. RESUME ACTIVE COLLECTION
// // -------------------------------------------

// const resumeActiveCollection = async () => {
//     const measurements = await SensorData.find({ mode: 0, status: "running", }).sort({ startedAt: -1 }).limit(2);

//     if (measurements.length > 1) {
//         throw new Error(
//             "Multiple running spectral collections found. " +
//             "Resolve them before starting MQTT."
//         );
//     }

//     const measurement = measurements[0] || null;

//     activeMeasurementId = measurement ? measurement._id.toString() : null;

//     if (measurement) {
//         console.log("Resumed MQTT Collection:", activeMeasurementId);
//     }

//     return measurement;
// };

// const publishCollectionCommand = (value) => {
//     return new Promise((resolve, reject) => {

//         if (!mqttClient || !mqttClient.connected) {
//             return reject(new Error("MQTT Broker Not Connected"));
//         }

//         const payload = String(value);

//         console.log("Publishing MQTT Command...");
//         console.log("Broker:", MQTT_BROKER_URL);
//         console.log("Topic:", MODE_TOPIC);
//         console.log("Payload:", payload);
//         console.log("Connected:", mqttClient.connected);

//         mqttClient.publish(
//             MODE_TOPIC,
//             payload,
//             {
//                 qos: 1,
//                 retain: false
//             },
//             (error) => {
//                 if (error) {
//                     console.error("MQTT Publish Failed:", error);
//                     return reject(error);
//                 }

//                 console.log("MQTT Publish Completed:", payload);
//                 resolve();
//             }
//         );
//     });
// };
// // -------------------------------------------
// // 3. START COLLECTION
// // -------------------------------------------

// const startCollection = (farmerId, mode = 0) =>
//     runCollectionOperation(async () => {
//         if (!mongoose.Types.ObjectId.isValid(farmerId)) {
//             throw new Error("Invalid Farmer ID");
//         }

//         if (Number(mode) !== 0) {
//             throw new Error("MQTT spectral collection supports mode 0 only");
//         }

//         if (!mqttClient || !mqttClient.connected) {
//             throw new Error("MQTT Broker Not Connected");
//         }

//         if (activeMeasurementId) {
//             throw new Error("A collection is already running. Stop it first.");
//         }

//         const existing = await SensorData.findOne({ mode: 0, status: "running", });

//         if (existing) {
//             activeMeasurementId = existing._id.toString();

//             throw new Error("An active collection already exists");
//         }

//         const measurement = await SensorData.create({
//             farmerId,
//             mode: 0,
//             status: "running",
//             startedAt: new Date(),
//             endsAt: null,
//             stoppedAt: null,
//             startEntryId: null,
//             lastProcessedEntryId: null,
//             expectedReadings: null,
//             readings: [],
//             lastError: null,
//         });

//         try {
//             // Send 1 to hardware
//             await publishCollectionCommand(1);
//         } catch (error) {
//             await SensorData.deleteOne({ _id: measurement._id });
//             throw error;
//         }

//         activeMeasurementId = measurement._id.toString();

//         console.log("MQTT Collection Started:", activeMeasurementId);

//         return measurement;
//     });

// // -------------------------------------------
// // 4. VALIDATE MQTT JSON
// // -------------------------------------------

// const SPECTRAL_CHANNELS = [
//     "A410", "B435", "C460", "D485",
//     "E510", "F535", "G560", "H585",
//     "R610", "I645", "S680", "J705",
//     "T730", "U760", "V810", "W860",
//     "K900", "L940"
// ];

// const parseSpectralMessage = (message) => {
//     const payload = JSON.parse(message.toString("utf8"));

//     if (!payload || typeof payload !== "object" || !payload.spectrum || typeof payload.spectrum !== "object") {
//         throw new Error("Invalid spectrum payload");
//     }

//     const spectralValues = SPECTRAL_CHANNELS.map((channel) => {
//         const value = payload.spectrum[channel];

//         if (typeof value !== "number" || !Number.isFinite(value)) {
//             throw new Error(`Invalid value for ${channel}`);
//         }

//         return value;
//     });

//     return {
//         measuredAt: new Date(),
//         spectralValues
//     };
// };

// // -------------------------------------------
// // 5. SAVE MQTT READING TO MONGODB
// // -------------------------------------------

// const saveMQTTReading = async (measurementId, message) => {
//     let reading;
//     try {
//         reading = parseSpectralMessage(message);
//     } catch (error) {
//         console.error("Invalid MQTT JSON:", error.message);
//         return;
//     }

//     const measurement = await SensorData.findOneAndUpdate(
//         {
//             _id: measurementId,
//             mode: 0,
//             status: "running",
//         },
//         [
//             {
//                 $set: {
//                     lastProcessedEntryId: {
//                         $add: [
//                             {
//                                 $ifNull: [
//                                     "$lastProcessedEntryId", 0,],
//                             },
//                             1,
//                         ],
//                     },

//                     readings: {
//                         $concatArrays: [
//                             { $ifNull: ["$readings", []] },
//                             [
//                                 {
//                                     entryId: {
//                                         $add: [
//                                             { $ifNull: ["$lastProcessedEntryId", 0,], },
//                                             1,
//                                         ],
//                                     },
//                                     measuredAt: { $literal: reading.measuredAt, },
//                                     spectralValues: { $literal: reading.spectralValues, },
//                                 },
//                             ],
//                         ],
//                     },
//                 },
//             },
//         ],
//         {
//             new: true,
//         }
//     );

//     if (measurement) {
//         console.log("Saved MQTT Reading:", measurement.lastProcessedEntryId);
//     } else {
//         console.log("Reading ignored: collection not running");
//     }
// };

// // -------------------------------------------
// // 6. STOP COLLECTION
// // -------------------------------------------

// const stopCollection = (measurementId) =>
//     runCollectionOperation(async () => {
//         if (!mongoose.Types.ObjectId.isValid(measurementId)) {
//             throw new Error("Invalid Measurement ID");
//         }

//         if (!activeMeasurementId || activeMeasurementId !== String(measurementId)) {
//             throw new Error("This is not the active collection");
//         }
//         // Send 0 to hardware
//         await publishCollectionCommand(0);

//         // Stop accepting incoming readings
//         activeMeasurementId = null;

//         // Save pending readings
//         await writeQueue;

//         const stoppedAt = new Date();

//         const measurement = await SensorData.findOneAndUpdate(
//             {
//                 _id: measurementId,
//                 mode: 0,
//                 status: "running",
//             },
//             {
//                 $set: {
//                     status: "completed",
//                     stoppedAt,
//                     endsAt: stoppedAt,
//                 },
//             },
//             {
//                 new: true,
//                 runValidators: true,
//             }
//         );

//         if (!measurement) {
//             throw new Error("Collection not found or already stopped");
//         }

//         console.log("MQTT Collection Stopped:", measurementId);

//         return measurement;
//     });

// // -------------------------------------------
// // 7. GET ACTIVE COLLECTION
// // -------------------------------------------

// const getActiveCollection = async () => {
//     if (!activeMeasurementId) {
//         return null;
//     }

//     return SensorData.findOne({
//         _id: activeMeasurementId,
//         mode: 0,
//         status: "running",
//     });
// };


// const publishSensorCommand = (field1, field2) => {
//     return new Promise((resolve, reject) => {
//         if (!mqttClient || !mqttClient.connected) {
//             return reject(new Error("MQTT broker is not connected"));
//         }

//         if (![0, 1].includes(field1) || ![0, 1].includes(field2)) {
//             return reject(new Error("Invalid field1 or field2 value"));
//         }

//         const topic = "milk/analyser/command";

//         const payload = JSON.stringify({ field1, field2, });

//         mqttClient.publish(topic, payload,
//             { qos: 1, retain: false },
//             (error) => {
//                 if (error) {
//                     return reject(error);
//                 }

//                 console.log("MQTT command published:", payload);

//                 resolve({ topic, field1, field2, });
//             }
//         );
//     });
// };

// // -------------------------------------------
// // 8. EXPORT FUNCTIONS
// // -------------------------------------------

// module.exports = {
//     connectMQTT,
//     resumeActiveCollection,
//     startCollection,
//     stopCollection,
//     getActiveCollection,
//     publishSensorCommand
// };


// Services/mqttcService.js




// "use strict";

// const fs = require("fs");
// const path = require("path");
// const mqtt = require("mqtt");
// const mongoose = require("mongoose");

// const SensorData = require("../models/SensorData");

// // ==========================================
// // 1. MQTT CONFIGURATION
// // ==========================================

// // Load dotenv in server.js before connecting MQTT.

// const TOPIC_ROOT =
//     process.env.MQTT_TOPIC_ROOT ||
//     "san-milk-a84f29/01";

// const TOPIC_FILTER = `${TOPIC_ROOT}/#`;

// const SPECTRUM_TOPIC =
//     `${TOPIC_ROOT}/result/spectrum`;

// const MODE_TOPIC =
//     `${TOPIC_ROOT}/control/mode`;

// const STATUS_TOPIC =
//     `${TOPIC_ROOT}/status`;

// const SENSOR_COMMAND_TOPIC =
//     "milk/analyser/command";

// // AS7265X spectral channels
// const SPECTRAL_CHANNELS = [
//     "A410", "B435", "C460", "D485",
//     "E510", "F535", "G560", "H585",
//     "R610", "I645", "S680", "J705",
//     "T730", "U760", "V810", "W860",
//     "K900", "L940"
// ];

// // ==========================================
// // 2. SESSION VARIABLES
// // ==========================================

// let mqttClient = null;

// let activeMeasurementId = null;

// let acceptingReadings = false;

// let writeQueue = Promise.resolve();

// let collectionOperation = Promise.resolve();

// // Serialize start/stop operations
// function runCollectionOperation(operation) {

//     const next = collectionOperation.then(operation);

//     collectionOperation = next.catch(() => { });

//     return next;
// }

// // ==========================================
// // 3. CONNECT AWS MOSQUITTO MQTT BROKER
// // ==========================================

// function connectMQTT() {

//     if (mqttClient) {
//         return mqttClient;
//     }

//     const brokerUrl =
//         process.env.MQTT_BROKER_URL ||
//         `mqtts://${process.env.MQTT_HOST || "13.206.23.174"}:8883`;

//     // Require encrypted MQTT
//     if (!brokerUrl.startsWith("mqtts://")) {
//         throw new Error(
//             "Use mqtts:// to enforce encrypted MQTT transport"
//         );
//     }

//     if (
//         !process.env.MQTT_USERNAME ||
//         !process.env.MQTT_PASSWORD
//     ) {
//         throw new Error(
//             "MQTT_USERNAME and MQTT_PASSWORD must be set in .env"
//         );
//     }

//     // CA certificate
//     const caPath = path.resolve(
//         process.env.MQTT_CA_PATH ||
//         "./certs/mqtt-ca-fixed.pem"
//     );

//     if (!fs.existsSync(caPath)) {
//         throw new Error(
//             `MQTT CA file not found: ${caPath}`
//         );
//     }

//     const ca = fs.readFileSync(caPath);

//     if (
//         !ca.toString("utf8")
//             .includes("-----BEGIN CERTIFICATE-----")
//     ) {
//         throw new Error(
//             "MQTT CA file must contain a PEM certificate"
//         );
//     }

//     // Connect to AWS Mosquitto
//     const client = mqtt.connect(brokerUrl, {

//         clientId:
//             process.env.CLIENTID ||
//             "milkanalyser_backend_01",

//         username: process.env.MQTT_USERNAME,

//         password: process.env.MQTT_PASSWORD,

//         ca,

//         rejectUnauthorized: true,

//         protocolVersion: 5,

//         clean: true,

//         reconnectPeriod: 5000,

//         connectTimeout: 30000,

//         keepalive: 60

//     });

//     mqttClient = client;

//     // ========================================
//     // MQTT CONNECTED
//     // ========================================

//     client.on("connect", () => {

//         console.log(
//             `AWS Mosquitto connected: ${brokerUrl}`
//         );

//         client.subscribe(
//             TOPIC_FILTER,
//             { qos: 1 },
//             (error, granted) => {

//                 if (error) {
//                     console.error(
//                         "MQTT subscribe error:",
//                         error.message
//                     );
//                     return;
//                 }

//                 if (
//                     !granted?.some(
//                         (g) => g.qos !== 128
//                     )
//                 ) {
//                     console.error(
//                         "MQTT subscription denied:",
//                         TOPIC_FILTER
//                     );
//                     return;
//                 }

//                 console.log(
//                     "MQTT subscribed:",
//                     TOPIC_FILTER
//                 );
//             }
//         );
//     });

//     // ========================================
//     // RECEIVE HARDWARE DATA
//     // ========================================

//     client.on("message", (topic, buffer) => {

//         if (topic === STATUS_TOPIC) {

//             console.log(
//                 "Device status:",
//                 buffer.toString("utf8")
//             );

//             return;
//         }

//         if (topic !== SPECTRUM_TOPIC) {
//             return;
//         }

//         if (
//             !acceptingReadings ||
//             !activeMeasurementId
//         ) {
//             console.log(
//                 "Spectrum ignored: no active collection"
//             );
//             return;
//         }

//         const measurementId =
//             activeMeasurementId;

//         const payloadCopy =
//             Buffer.from(buffer);

//         writeQueue = writeQueue
//             .then(() =>
//                 saveMQTTReading(
//                     measurementId,
//                     payloadCopy
//                 )
//             )
//             .catch((error) => {

//                 console.error(
//                     "MQTT save error:",
//                     error.message
//                 );

//             });
//     });

//     // ========================================
//     // MQTT ERROR HANDLING
//     // ========================================

//     client.on("error", (error) => {

//         console.error(
//             "MQTT error:",
//             error.message
//         );

//     });

//     client.on("reconnect", () => {

//         console.log("MQTT reconnecting...");

//     });

//     client.on("offline", () => {

//         console.log("MQTT offline");

//     });

//     client.on("close", () => {

//         console.log("MQTT connection closed");

//     });

//     return client;
// }

// // ==========================================
// // 4. RESUME ACTIVE COLLECTION
// // ==========================================

// async function resumeActiveCollection() {

//     const measurements =
//         await SensorData.find({
//             mode: 0,
//             status: "running"
//         })
//             .sort({ startedAt: -1 })
//             .limit(2);

//     if (measurements.length > 1) {

//         throw new Error(
//             "Multiple running collections found; resolve them first"
//         );

//     }

//     activeMeasurementId =
//         measurements[0]?._id.toString() ||
//         null;

//     acceptingReadings =
//         Boolean(activeMeasurementId);

//     if (activeMeasurementId) {

//         console.log(
//             "Resumed collection:",
//             activeMeasurementId
//         );

//     }

//     return measurements[0] || null;
// }

// // ==========================================
// // 5. MQTT PUBLISH FUNCTION
// // ==========================================

// function publishTopic(topic, value) {

//     return new Promise((resolve, reject) => {

//         if (!mqttClient?.connected) {

//             return reject(
//                 new Error(
//                     "MQTT broker not connected"
//                 )
//             );

//         }

//         mqttClient.publish(
//             topic,
//             String(value),
//             {
//                 qos: 1,
//                 retain: false
//             },
//             (error) => {

//                 if (error) {
//                     return reject(error);
//                 }

//                 console.log(
//                     "MQTT published:",
//                     topic
//                 );

//                 resolve();
//             }
//         );
//     });
// }

// // Existing hardware command contract
// function publishCollectionCommand(value) {

//     return publishTopic(
//         MODE_TOPIC,
//         value
//     );
// }

// // ==========================================
// // 6. START COLLECTION
// // ==========================================

// function startCollection(farmerId, mode = 0) {

//     return runCollectionOperation(async () => {

//         if (
//             !mongoose.Types.ObjectId.isValid(
//                 farmerId
//             )
//         ) {
//             throw new Error(
//                 "Invalid Farmer ID"
//             );
//         }

//         if (Number(mode) !== 0) {

//             throw new Error(
//                 "Spectral collection supports mode 0 only"
//             );

//         }

//         if (!mqttClient?.connected) {

//             throw new Error(
//                 "MQTT broker not connected"
//             );

//         }

//         if (activeMeasurementId) {

//             throw new Error(
//                 "A collection is already running"
//             );

//         }

//         const existing =
//             await SensorData.findOne({
//                 mode: 0,
//                 status: "running"
//             });

//         if (existing) {

//             activeMeasurementId =
//                 existing._id.toString();

//             acceptingReadings = true;

//             throw new Error(
//                 "An active collection already exists"
//             );
//         }

//         const measurement =
//             await SensorData.create({

//                 farmerId,

//                 mode: 0,

//                 status: "running",

//                 startedAt: new Date(),

//                 endsAt: null,

//                 stoppedAt: null,

//                 startEntryId: null,

//                 lastProcessedEntryId: null,

//                 expectedReadings: null,

//                 readings: [],

//                 lastError: null

//             });

//         activeMeasurementId =
//             measurement._id.toString();

//         acceptingReadings = true;

//         try {

//             await publishCollectionCommand(1);

//         } catch (error) {

//             acceptingReadings = false;

//             activeMeasurementId = null;

//             await writeQueue;

//             await SensorData.deleteOne({
//                 _id: measurement._id
//             });

//             throw error;
//         }

//         console.log(
//             "Collection started:",
//             activeMeasurementId
//         );

//         return measurement;
//     });
// }

// // CONTINUE WITH PART 2 BELOW

// // ==========================================
// // 7. VALIDATE SENSOR SPECTRUM
// // ==========================================

// function parseSpectralMessage(message) {

//     const payload = JSON.parse(
//         message.toString("utf8")
//     );

//     if (
//         !payload ||
//         typeof payload !== "object" ||
//         !payload.spectrum ||
//         typeof payload.spectrum !== "object"
//     ) {
//         throw new Error(
//             "Invalid spectrum payload"
//         );
//     }

//     const spectralValues =
//         SPECTRAL_CHANNELS.map((name) => {

//             const n =
//                 payload.spectrum[name];

//             if (
//                 typeof n !== "number" ||
//                 !Number.isFinite(n)
//             ) {
//                 throw new Error(
//                     `Invalid spectrum value: ${name}`
//                 );
//             }

//             return n;
//         });

//     return {
//         measuredAt: new Date(),
//         spectralValues
//     };
// }

// // ==========================================
// // 8. SAVE SPECTRUM TO MONGODB
// // ==========================================

// async function saveMQTTReading(
//     measurementId,
//     message
// ) {

//     let reading;

//     try {

//         reading =
//             parseSpectralMessage(message);

//     } catch (error) {

//         console.error(
//             "Invalid MQTT reading:",
//             error.message
//         );

//         return;
//     }

//     // Preserve existing SensorData schema
//     // and sequential entry IDs.

//     const doc =
//         await SensorData.findOneAndUpdate(

//             {
//                 _id: measurementId,
//                 mode: 0,
//                 status: "running"
//             },

//             [
//                 {
//                     $set: {

//                         lastProcessedEntryId: {
//                             $add: [
//                                 {
//                                     $ifNull: [
//                                         "$lastProcessedEntryId",
//                                         0
//                                     ]
//                                 },
//                                 1
//                             ]
//                         },

//                         readings: {
//                             $concatArrays: [
//                                 {
//                                     $ifNull: [
//                                         "$readings",
//                                         []
//                                     ]
//                                 },
//                                 [
//                                     {

//                                         entryId: {
//                                             $add: [
//                                                 {
//                                                     $ifNull: [
//                                                         "$lastProcessedEntryId",
//                                                         0
//                                                     ]
//                                                 },
//                                                 1
//                                             ]
//                                         },

//                                         measuredAt: {
//                                             $literal:
//                                                 reading.measuredAt
//                                         },

//                                         spectralValues: {
//                                             $literal:
//                                                 reading.spectralValues
//                                         }

//                                     }
//                                 ]
//                             ]
//                         }
//                     }
//                 }
//             ],

//             {
//                 new: true
//             }
//         );

//     if (doc) {

//         console.log(
//             "Saved spectrum reading:",
//             doc.lastProcessedEntryId
//         );

//     } else {

//         console.log(
//             "Reading ignored: collection no longer running"
//         );

//     }
// }

// // ==========================================
// // 9. STOP COLLECTION
// // ==========================================

// function stopCollection(measurementId) {

//     return runCollectionOperation(async () => {

//         if (
//             !mongoose.Types.ObjectId.isValid(
//                 measurementId
//             )
//         ) {

//             throw new Error(
//                 "Invalid Measurement ID"
//             );

//         }

//         if (
//             !activeMeasurementId ||
//             activeMeasurementId !==
//             String(measurementId)
//         ) {

//             throw new Error(
//                 "This is not the active collection"
//             );

//         }

//         if (!mqttClient?.connected) {

//             throw new Error(
//                 "MQTT broker not connected"
//             );

//         }

//         await publishCollectionCommand(0);

//         acceptingReadings = false;

//         activeMeasurementId = null;

//         // Wait for pending MongoDB writes
//         await writeQueue;

//         const stoppedAt = new Date();

//         const measurement =
//             await SensorData.findOneAndUpdate(

//                 {
//                     _id: measurementId,
//                     mode: 0,
//                     status: "running"
//                 },

//                 {
//                     $set: {

//                         status: "completed",

//                         stoppedAt,

//                         endsAt: stoppedAt

//                     }
//                 },

//                 {
//                     new: true,
//                     runValidators: true
//                 }
//             );

//         if (!measurement) {

//             throw new Error(
//                 "Collection not found or already stopped"
//             );

//         }

//         console.log(
//             "Collection stopped:",
//             measurementId
//         );

//         return measurement;
//     });
// }

// // ==========================================
// // 10. GET ACTIVE COLLECTION
// // ==========================================

// function getActiveCollection() {

//     if (!activeMeasurementId) {

//         return Promise.resolve(null);

//     }

//     return SensorData.findOne({

//         _id: activeMeasurementId,

//         mode: 0,

//         status: "running"

//     });
// }

// // ==========================================
// // 11. PUBLISH SENSOR COMMAND
// // ==========================================

// async function publishSensorCommand(
//     field1,
//     field2
// ) {

//     if (
//         ![0, 1].includes(field1) ||
//         ![0, 1].includes(field2)
//     ) {

//         throw new Error(
//             "Invalid field1 or field2 value"
//         );

//     }

//     const payload = JSON.stringify({
//         field1,
//         field2
//     });

//     await publishTopic(
//         SENSOR_COMMAND_TOPIC,
//         payload
//     );

//     return {

//         topic: SENSOR_COMMAND_TOPIC,

//         field1,

//         field2

//     };
// }

// // ==========================================
// // 12. EXPORT FUNCTIONS
// // ==========================================

// module.exports = {

//     connectMQTT,

//     resumeActiveCollection,

//     startCollection,

//     stopCollection,

//     getActiveCollection,

//     publishSensorCommand

// };





// "use strict";

// const fs = require("fs");
// const path = require("path");
// const mqtt = require("mqtt");
// const mongoose = require("mongoose");
// const EventEmitter = require("events");

// const SensorData = require("../models/SensorData");

// // ==========================================
// // 1. MQTT CONFIGURATION
// // ==========================================

// const TOPIC_ROOT =
//     process.env.MQTT_TOPIC_ROOT ||
//     "san-milk-a84f29/01";

// const TOPIC_FILTER = `${TOPIC_ROOT}/#`;

// const SPECTRUM_TOPIC = `${TOPIC_ROOT}/result/spectrum`;
// const MODE_TOPIC = `${TOPIC_ROOT}/control/mode`;
// const STATUS_TOPIC = `${TOPIC_ROOT}/status`;

// const SENSOR_COMMAND_TOPIC = "milk/analyser/command";

// const BROKER_URL =
//     process.env.MQTT_BROKER_URL ||
//     `mqtts://${process.env.MQTT_HOST || "13.206.23.174"}:8883`;

// const CLIENT_ID =
//     process.env.CLIENTID || "milkanalyser_backend_01";

// // AS7265X spectral channels
// const SPECTRAL_CHANNELS = [
//     "A410", "B435", "C460", "D485",
//     "E510", "F535", "G560", "H585",
//     "R610", "I645", "S680", "J705",
//     "T730", "U760", "V810", "W860",
//     "K900", "L940"
// ];

// // Shared event emitter for Milk Test service.
// const mqttEvents = new EventEmitter();
// mqttEvents.setMaxListeners(50);

// // ==========================================
// // 2. SESSION VARIABLES
// // ==========================================

// let mqttClient = null;
// let mqttConnected = false;

// let activeMeasurementId = null;
// let acceptingReadings = false;

// let writeQueue = Promise.resolve();
// let collectionOperation = Promise.resolve();

// function runCollectionOperation(operation) {
//     const next = collectionOperation.then(operation);
//     collectionOperation = next.catch(() => {});
//     return next;
// }

// // ==========================================
// // 3. FARMER-SPECIFIC MQTT TOPICS
// // ==========================================

// function getFarmerTopic(farmerCustomId, type) {
//     const id = String(farmerCustomId || "");

//     if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
//         throw new Error("Invalid farmer custom ID for MQTT topic.");
//     }

//     const allowedTopics = [
//         "status",
//         "control/mode",
//         "result/spectrum",
//         "control/enable",
//         "result/predict"
//     ];

//     if (!allowedTopics.includes(type)) {
//         throw new Error("Invalid MQTT topic type.");
//     }

//     return `${TOPIC_ROOT}/${id}/${type}`;
// }

// function getFarmerTopicInfo(topic) {
//     const prefix = `${TOPIC_ROOT}/`;

//     if (!topic.startsWith(prefix)) {
//         return null;
//     }

//     const remaining = topic.slice(prefix.length);
//     const parts = remaining.split("/");

//     if (parts.length < 2) {
//         return null;
//     }

//     const farmerCustomId = parts[0];
//     const category = parts.slice(1).join("/");

//     if (!/^[a-zA-Z0-9_-]+$/.test(farmerCustomId)) {
//         return null;
//     }

//     if (!["status", "result/spectrum"].includes(category)) {
//         return null;
//     }

//     return { farmerCustomId, category };
// }

// // ==========================================
// // 4. PARSE MILK TEST SPECTRAL DATA
// // ==========================================

// function parseMilkTestSpectrum(buffer) {
//     const raw = buffer.toString("utf8");

//     let payload;

//     try {
//         payload = JSON.parse(raw);
//     } catch {
//         throw new Error(
//             "Invalid JSON received from Milk Test device."
//         );
//     }

//     let values;

//     // Format 1: [18 values]
//     if (Array.isArray(payload)) {
//         values = payload;
//     }

//     // Format 2: { spectralValues: [18 values] }
//     else if (Array.isArray(payload?.spectralValues)) {
//         values = payload.spectralValues;
//     }

//     // Format 3: { spectrum: [18 values] }
//     else if (Array.isArray(payload?.spectrum)) {
//         values = payload.spectrum;
//     }

//     // Format 4: { spectrum: { A410: ..., B435: ... } }
//     else if (
//         payload?.spectrum &&
//         typeof payload.spectrum === "object"
//     ) {
//         values = SPECTRAL_CHANNELS.map(
//             channel => payload.spectrum[channel]
//         );
//     } else {
//         throw new Error(
//             "Unsupported Milk Test spectrum payload."
//         );
//     }

//     if (!Array.isArray(values) || values.length !== 18) {
//         throw new Error(
//             "Exactly 18 spectral values are required."
//         );
//     }

//     const spectralValues = values.map(value => {
//         if (
//             typeof value !== "number" &&
//             !(typeof value === "string" && value.trim() !== "")
//         ) {
//             return NaN;
//         }

//         return Number(value);
//     });

//     if (!spectralValues.every(Number.isFinite)) {
//         throw new Error(
//             "Spectral values must contain valid numbers."
//         );
//     }

//     return spectralValues;
// }

// // ==========================================
// // 5. PARSE MILK TEST DEVICE STATUS
// // ==========================================

// function parseMilkTestDeviceStatus(buffer) {
//     const raw = buffer.toString("utf8").trim();

//     try {
//         const payload = JSON.parse(raw);

//         if (typeof payload === "string") {
//             return payload.toLowerCase();
//         }

//         return String(
//             payload?.status || ""
//         ).toLowerCase();

//     } catch {
//         return raw.toLowerCase();
//     }
// }

// // ==========================================
// // 6. HANDLE FARMER-SPECIFIC MQTT MESSAGES
// // ==========================================

// function handleMilkTestMessage(topic, buffer) {
//     const topicInfo = getFarmerTopicInfo(topic);

//     if (!topicInfo) {
//         return false;
//     }

//     const { farmerCustomId, category } = topicInfo;

//     // DEVICE STATUS
//     if (category === "status") {
//         const status = parseMilkTestDeviceStatus(buffer);

//         if (!["running", "offline"].includes(status)) {
//             console.warn(
//                 "Invalid Milk Test device status:",
//                 status
//             );

//             mqttEvents.emit("invalidMessage", {
//                 farmerCustomId,
//                 topic,
//                 reason: "Invalid device status"
//             });

//             return true;
//         }

//         mqttEvents.emit("deviceStatus", {
//             farmerCustomId,
//             status,
//             topic,
//             receivedAt: new Date()
//         });

//         return true;
//     }

//     // SPECTRAL DATA
//     if (category === "result/spectrum") {
//         try {
//             const spectralValues =
//                 parseMilkTestSpectrum(buffer);

//             mqttEvents.emit("spectrum", {
//                 farmerCustomId,
//                 spectralValues,
//                 topic,
//                 receivedAt: new Date()
//             });

//         } catch (error) {
//             console.error(
//                 "Invalid Milk Test spectral message:",
//                 error.message
//             );

//             mqttEvents.emit("invalidMessage", {
//                 farmerCustomId,
//                 topic,
//                 reason: error.message
//             });
//         }

//         return true;
//     }

//     return false;
// }

// // ==========================================
// // 7. CONNECT TO EXISTING MQTT BROKER
// // ==========================================

// function connectMQTT() {
//     if (mqttClient) {
//         return mqttClient;
//     }

//     if (!BROKER_URL.startsWith("mqtts://")) {
//         throw new Error(
//             "Use mqtts:// to enforce encrypted MQTT transport."
//         );
//     }

//     if (
//         !process.env.MQTT_USERNAME ||
//         !process.env.MQTT_PASSWORD
//     ) {
//         throw new Error(
//             "MQTT_USERNAME and MQTT_PASSWORD must be set in .env."
//         );
//     }

//     const caPath = path.resolve(
//         process.env.MQTT_CA_PATH ||
//         "./certs/mqtt-ca-fixed.pem"
//     );

//     if (!fs.existsSync(caPath)) {
//         throw new Error(
//             `MQTT CA file not found: ${caPath}`
//         );
//     }

//     const ca = fs.readFileSync(caPath);

//     if (
//         !ca.toString("utf8").includes(
//             "-----BEGIN CERTIFICATE-----"
//         )
//     ) {
//         throw new Error(
//             "MQTT CA file must contain a PEM certificate."
//         );
//     }

//     // Only one MQTT client is created here.
//     // Both collection and Milk Test reuse this client.
//     const client = mqtt.connect(BROKER_URL, {
//         clientId: CLIENT_ID,
//         username: process.env.MQTT_USERNAME,
//         password: process.env.MQTT_PASSWORD,
//         ca,
//         rejectUnauthorized: true,
//         protocolVersion: 5,
//         clean: true,
//         reconnectPeriod: 5000,
//         connectTimeout: 30000,
//         keepalive: 60
//     });

//     mqttClient = client;

//     // MQTT CONNECTED
//     client.on("connect", () => {
//         mqttConnected = true;

//         console.log(
//             "AWS Mosquitto connected:",
//             BROKER_URL
//         );

//         console.log(
//             "MQTT Client ID:",
//             CLIENT_ID
//         );

//         client.subscribe(
//             TOPIC_FILTER,
//             { qos: 1 },
//             (error, granted) => {
//                 if (error) {
//                     console.error(
//                         "MQTT subscribe error:",
//                         error.message
//                     );

//                     mqttEvents.emit("subscriptionError", error);
//                     return;
//                 }

//                 const denied = (granted || []).filter(
//                     item => item.qos === 128
//                 );

//                 if (denied.length > 0) {
//                     console.error(
//                         "MQTT subscription denied:",
//                         denied.map(item => item.topic)
//                     );

//                     mqttEvents.emit(
//                         "subscriptionError",
//                         new Error("MQTT subscription denied.")
//                     );

//                     return;
//                 }

//                 console.log(
//                     "MQTT subscribed:",
//                     TOPIC_FILTER
//                 );

//                 console.log(
//                     "Existing collection and Milk Test topics are covered."
//                 );
//             }
//         );

//         mqttEvents.emit("connected");
//     });

//     // ========================================
//     // RECEIVE HARDWARE DATA
//     // ========================================

//     client.on("message", (topic, buffer) => {

//         // First handle farmer-specific Milk Test topics.
//         if (handleMilkTestMessage(topic, buffer)) {
//             return;
//         }

//         // Existing collection status topic.
//         if (topic === STATUS_TOPIC) {
//             console.log(
//                 "Device status:",
//                 buffer.toString("utf8")
//             );

//             return;
//         }

//         // Existing collection spectrum topic.
//         if (topic !== SPECTRUM_TOPIC) {
//             return;
//         }

//         if (
//             !acceptingReadings ||
//             !activeMeasurementId
//         ) {
//             console.log(
//                 "Spectrum ignored: no active collection"
//             );

//             return;
//         }

//         const measurementId = activeMeasurementId;
//         const payloadCopy = Buffer.from(buffer);

//         writeQueue = writeQueue
//             .then(() =>
//                 saveMQTTReading(
//                     measurementId,
//                     payloadCopy
//                 )
//             )
//             .catch(error => {
//                 console.error(
//                     "MQTT save error:",
//                     error.message
//                 );
//             });
//     });

//     // MQTT ERROR HANDLING
//     client.on("error", error => {
//         console.error(
//             "MQTT error:",
//             error.message
//         );

//         mqttEvents.emit("mqttError", error);
//     });

//     client.on("reconnect", () => {
//         console.log("MQTT reconnecting...");
//         mqttEvents.emit("reconnecting");
//     });

//     client.on("offline", () => {
//         mqttConnected = false;

//         console.log("MQTT offline");

//         mqttEvents.emit("offline");
//     });

//     client.on("close", () => {
//         mqttConnected = false;

//         console.log("MQTT connection closed");

//         mqttEvents.emit("disconnected");
//     });

//     return client;
// }

// // ==========================================
// // 8. RESUME ACTIVE COLLECTION
// // ==========================================

// async function resumeActiveCollection() {
//     const measurements = await SensorData.find({
//         mode: 0,
//         status: "running"
//     })
//         .sort({ startedAt: -1 })
//         .limit(2);

//     if (measurements.length > 1) {
//         throw new Error(
//             "Multiple running collections found; resolve them first."
//         );
//     }

//     activeMeasurementId =
//         measurements[0]?._id.toString() || null;

//     acceptingReadings =
//         Boolean(activeMeasurementId);

//     if (activeMeasurementId) {
//         console.log(
//             "Resumed collection:",
//             activeMeasurementId
//         );
//     }

//     return measurements[0] || null;
// }

// // ==========================================
// // 9. SHARED MQTT PUBLISH FUNCTION
// // ==========================================

// function publishTopic(topic, value) {
//     return new Promise((resolve, reject) => {
//         if (!mqttClient?.connected) {
//             return reject(
//                 new Error("MQTT broker not connected.")
//             );
//         }

//         mqttClient.publish(
//             topic,
//             String(value),
//             {
//                 qos: 1,
//                 retain: false
//             },
//             error => {
//                 if (error) {
//                     return reject(error);
//                 }

//                 console.log(
//                     "MQTT published:",
//                     topic
//                 );

//                 resolve({
//                     topic,
//                     payload: String(value)
//                 });
//             }
//         );
//     });
// }

// // Existing collection command contract.
// function publishCollectionCommand(value) {
//     return publishTopic(
//         MODE_TOPIC,
//         value
//     );
// }

// // ==========================================
// // 10. START EXISTING COLLECTION
// // ==========================================

// function startCollection(farmerId, mode = 0) {
//     return runCollectionOperation(async () => {

//         if (
//             !mongoose.Types.ObjectId.isValid(farmerId)
//         ) {
//             throw new Error("Invalid Farmer ID.");
//         }

//         if (Number(mode) !== 0) {
//             throw new Error(
//                 "Spectral collection supports mode 0 only."
//             );
//         }

//         if (!mqttClient?.connected) {
//             throw new Error(
//                 "MQTT broker not connected."
//             );
//         }

//         if (activeMeasurementId) {
//             throw new Error(
//                 "A collection is already running."
//             );
//         }

//         const existing = await SensorData.findOne({
//             mode: 0,
//             status: "running"
//         });

//         if (existing) {
//             activeMeasurementId =
//                 existing._id.toString();

//             acceptingReadings = true;

//             throw new Error(
//                 "An active collection already exists."
//             );
//         }

//         const measurement = await SensorData.create({
//             farmerId,
//             mode: 0,
//             status: "running",
//             startedAt: new Date(),
//             endsAt: null,
//             stoppedAt: null,
//             startEntryId: null,
//             lastProcessedEntryId: null,
//             expectedReadings: null,
//             readings: [],
//             lastError: null
//         });

//         activeMeasurementId =
//             measurement._id.toString();

//         acceptingReadings = true;

//         try {
//             await publishCollectionCommand(1);
//         } catch (error) {
//             acceptingReadings = false;
//             activeMeasurementId = null;

//             await writeQueue;

//             await SensorData.deleteOne({
//                 _id: measurement._id
//             });

//             throw error;
//         }

//         console.log(
//             "Collection started:",
//             activeMeasurementId
//         );

//         return measurement;
//     });
// }

// // ==========================================
// // 11. VALIDATE EXISTING COLLECTION SPECTRUM
// // ==========================================

// function parseSpectralMessage(message) {
//     const payload = JSON.parse(
//         message.toString("utf8")
//     );

//     if (
//         !payload ||
//         typeof payload !== "object" ||
//         !payload.spectrum ||
//         typeof payload.spectrum !== "object"
//     ) {
//         throw new Error("Invalid spectrum payload.");
//     }

//     const spectralValues =
//         SPECTRAL_CHANNELS.map(name => {
//             const value = payload.spectrum[name];

//             if (
//                 typeof value !== "number" ||
//                 !Number.isFinite(value)
//             ) {
//                 throw new Error(
//                     `Invalid spectrum value: ${name}`
//                 );
//             }

//             return value;
//         });

//     return {
//         measuredAt: new Date(),
//         spectralValues
//     };
// }

// // ==========================================
// // 12. SAVE EXISTING COLLECTION SPECTRUM
// // ==========================================

// async function saveMQTTReading(
//     measurementId,
//     message
// ) {
//     let reading;

//     try {
//         reading = parseSpectralMessage(message);
//     } catch (error) {
//         console.error(
//             "Invalid MQTT reading:",
//             error.message
//         );

//         return;
//     }

//     const doc = await SensorData.findOneAndUpdate(
//         {
//             _id: measurementId,
//             mode: 0,
//             status: "running"
//         },
//         [
//             {
//                 $set: {
//                     lastProcessedEntryId: {
//                         $add: [
//                             {
//                                 $ifNull: [
//                                     "$lastProcessedEntryId",
//                                     0
//                                 ]
//                             },
//                             1
//                         ]
//                     },

//                     readings: {
//                         $concatArrays: [
//                             {
//                                 $ifNull: [
//                                     "$readings",
//                                     []
//                                 ]
//                             },
//                             [
//                                 {
//                                     entryId: {
//                                         $add: [
//                                             {
//                                                 $ifNull: [
//                                                     "$lastProcessedEntryId",
//                                                     0
//                                                 ]
//                                             },
//                                             1
//                                         ]
//                                     },

//                                     measuredAt: {
//                                         $literal: reading.measuredAt
//                                     },

//                                     spectralValues: {
//                                         $literal: reading.spectralValues
//                                     }
//                                 }
//                             ]
//                         ]
//                     }
//                 }
//             }
//         ],
//         {
//             new: true
//         }
//     );

//     if (doc) {
//         console.log(
//             "Saved spectrum reading:",
//             doc.lastProcessedEntryId
//         );
//     } else {
//         console.log(
//             "Reading ignored: collection no longer running."
//         );
//     }
// }

// // ==========================================
// // 13. STOP EXISTING COLLECTION
// // ==========================================

// function stopCollection(measurementId) {
//     return runCollectionOperation(async () => {

//         if (
//             !mongoose.Types.ObjectId.isValid(measurementId)
//         ) {
//             throw new Error("Invalid Measurement ID.");
//         }

//         if (
//             !activeMeasurementId ||
//             activeMeasurementId !== String(measurementId)
//         ) {
//             throw new Error(
//                 "This is not the active collection."
//             );
//         }

//         if (!mqttClient?.connected) {
//             throw new Error(
//                 "MQTT broker not connected."
//             );
//         }

//         await publishCollectionCommand(0);

//         acceptingReadings = false;
//         activeMeasurementId = null;

//         await writeQueue;

//         const stoppedAt = new Date();

//         const measurement =
//             await SensorData.findOneAndUpdate(
//                 {
//                     _id: measurementId,
//                     mode: 0,
//                     status: "running"
//                 },
//                 {
//                     $set: {
//                         status: "completed",
//                         stoppedAt,
//                         endsAt: stoppedAt
//                     }
//                 },
//                 {
//                     new: true,
//                     runValidators: true
//                 }
//             );

//         if (!measurement) {
//             throw new Error(
//                 "Collection not found or already stopped."
//             );
//         }

//         console.log(
//             "Collection stopped:",
//             measurementId
//         );

//         return measurement;
//     });
// }

// // ==========================================
// // 14. GET ACTIVE COLLECTION
// // ==========================================

// function getActiveCollection() {
//     if (!activeMeasurementId) {
//         return Promise.resolve(null);
//     }

//     return SensorData.findOne({
//         _id: activeMeasurementId,
//         mode: 0,
//         status: "running"
//     });
// }

// // ==========================================
// // 15. PUBLISH EXISTING SENSOR COMMAND
// // ==========================================

// async function publishSensorCommand(field1, field2) {
//     if (
//         ![0, 1].includes(field1) ||
//         ![0, 1].includes(field2)
//     ) {
//         throw new Error(
//             "Invalid field1 or field2 value."
//         );
//     }

//     const payload = JSON.stringify({
//         field1,
//         field2
//     });

//     await publishTopic(
//         SENSOR_COMMAND_TOPIC,
//         payload
//     );

//     return {
//         topic: SENSOR_COMMAND_TOPIC,
//         field1,
//         field2
//     };
// }

// // ==========================================
// // 16. MILK TEST - PUBLISH MODE
// // ==========================================

// async function publishMode(farmerCustomId, mode) {
//     if (![0, 1].includes(Number(mode))) {
//         throw new Error("Mode must be 0 or 1.");
//     }

//     const topic = getFarmerTopic(
//         farmerCustomId,
//         "control/mode"
//     );

//     return publishTopic(
//         topic,
//         Number(mode)
//     );
// }

// // ==========================================
// // 17. MILK TEST - PUBLISH ENABLE / STOP
// // ==========================================

// async function publishEnable(farmerCustomId, value) {
//     if (![0, 1].includes(Number(value))) {
//         throw new Error("Enable value must be 0 or 1.");
//     }

//     const topic = getFarmerTopic(
//         farmerCustomId,
//         "control/enable"
//     );

//     return publishTopic(
//         topic,
//         Number(value)
//     );
// }

// // ==========================================
// // 18. MILK TEST - PUBLISH FINAL PREDICTION
// // ==========================================

// async function publishPrediction(farmerCustomId, prediction) {
//     if (
//         !prediction ||
//         ![0, 1].includes(Number(prediction.mode))
//     ) {
//         throw new Error(
//             "Invalid Milk Test prediction."
//         );
//     }

//     const topic = getFarmerTopic(
//         farmerCustomId,
//         "result/predict"
//     );

//     return publishTopic(
//         topic,
//         JSON.stringify(prediction)
//     );
// }

// // ==========================================
// // 19. GET SHARED MQTT STATUS
// // ==========================================

// function getMQTTStatus() {
//     return {
//         connected: Boolean(
//             mqttClient?.connected && mqttConnected
//         ),
//         clientId: CLIENT_ID,
//         broker: BROKER_URL,
//         topicRoot: TOPIC_ROOT
//     };
// }

// // ==========================================
// // 20. EXPORT ALL FUNCTIONS
// // ==========================================

// module.exports = {

//     // Existing MQTT connection
//     connectMQTT,

//     // Existing collection functions
//     resumeActiveCollection,
//     startCollection,
//     stopCollection,
//     getActiveCollection,
//     publishSensorCommand,

//     // Milk Test shared MQTT functions
//     getFarmerTopic,
//     publishMode,
//     publishEnable,
//     publishPrediction,
//     getMQTTStatus,
//     mqttEvents

// };



"use strict";

const fs = require("fs");
const path = require("path");
const mqtt = require("mqtt");
const mongoose = require("mongoose");
const EventEmitter = require("events");

const SensorData = require("../models/SensorData");

// ==========================================
// 1. MQTT CONFIGURATION
// ==========================================

const TOPIC_ROOT =
    process.env.MQTT_TOPIC_ROOT ||
    "san-milk-a84f29/01";

const TOPIC_FILTER = `${TOPIC_ROOT}/#`;

// Existing root-level collection topics (kept for compatibility)
const SPECTRUM_TOPIC = `${TOPIC_ROOT}/result/spectrum`;
const MODE_TOPIC = `${TOPIC_ROOT}/control/mode`;
const STATUS_TOPIC = `${TOPIC_ROOT}/status`;

// ==========================================
// 2. GENERIC SENSOR DATA COLLECTION TOPICS
// ==========================================

const MILK_TEST_TOPIC_ROOT = `${TOPIC_ROOT}/milkTest`;

const MILK_TEST_ENABLE_TOPIC =
    `${MILK_TEST_TOPIC_ROOT}/control/enable`;

const MILK_TEST_SPECTRUM_TOPIC =
    `${MILK_TEST_TOPIC_ROOT}/result/spectrum`;

const MILK_TEST_MODE_TOPIC =
    `${MILK_TEST_TOPIC_ROOT}/control/mode`;

const MILK_TEST_STATUS_TOPIC =
    `${MILK_TEST_TOPIC_ROOT}/status`;

// Existing sensor command topic
const SENSOR_COMMAND_TOPIC = "milk/analyser/command";

const BROKER_URL =
    process.env.MQTT_BROKER_URL ||
    `mqtts://${process.env.MQTT_HOST || "13.206.23.174"}:8883`;

const CLIENT_ID =
    process.env.CLIENTID || "milkanalyser_backend_01";

// AS7265X spectral channels
const SPECTRAL_CHANNELS = [
    "A410", "B435", "C460", "D485",
    "E510", "F535", "G560", "H585",
    "R610", "I645", "S680", "J705",
    "T730", "U760", "V810", "W860",
    "K900", "L940"
];

// Shared event emitter for Milk Test service.
const mqttEvents = new EventEmitter();
mqttEvents.setMaxListeners(50);

// ==========================================
// 3. SESSION VARIABLES
// ==========================================

let mqttClient = null;
let mqttConnected = false;

let activeMeasurementId = null;
let acceptingReadings = false;

let writeQueue = Promise.resolve();
let collectionOperation = Promise.resolve();

function runCollectionOperation(operation) {
    const next = collectionOperation.then(operation);

    collectionOperation = next.catch(() => { });

    return next;
}

// ==========================================
// 4. FARMER-SPECIFIC MQTT TOPICS
// ==========================================

function getFarmerTopic(farmerCustomId, type) {
    const id = String(farmerCustomId || "");

    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
        throw new Error("Invalid farmer custom ID for MQTT topic.");
    }

    const allowedTopics = [
        "status",
        "control/mode",
        "result/spectrum",
        "control/enable",
        "result/predict"
    ];

    if (!allowedTopics.includes(type)) {
        throw new Error("Invalid MQTT topic type.");
    }

    return `${TOPIC_ROOT}/${id}/${type}`;
}

function getFarmerTopicInfo(topic) {
    const prefix = `${TOPIC_ROOT}/`;

    if (!topic.startsWith(prefix)) {
        return null;
    }

    const remaining = topic.slice(prefix.length);
    const parts = remaining.split("/");

    if (parts.length < 2) {
        return null;
    }

    const farmerCustomId = parts[0];
    const category = parts.slice(1).join("/");

    if (!/^[a-zA-Z0-9_-]+$/.test(farmerCustomId)) {
        return null;
    }

    if (!["status", "result/spectrum"].includes(category)) {
        return null;
    }

    return { farmerCustomId, category };
}

// ==========================================
// 5. PARSE MILK TEST SPECTRAL DATA
// ==========================================

function parseMilkTestSpectrum(buffer) {
    const raw = buffer.toString("utf8");

    let payload;

    try {
        payload = JSON.parse(raw);
    } catch {
        throw new Error(
            "Invalid JSON received from Milk Test device."
        );
    }

    let values;

    // Format 1: [18 values]
    if (Array.isArray(payload)) {
        values = payload;
    }

    // Format 2: { spectralValues: [18 values] }
    else if (Array.isArray(payload?.spectralValues)) {
        values = payload.spectralValues;
    }

    // Format 3: { spectrum: [18 values] }
    else if (Array.isArray(payload?.spectrum)) {
        values = payload.spectrum;
    }

    // Format 4: { spectrum: { A410: ..., B435: ... } }
    else if (
        payload?.spectrum &&
        typeof payload.spectrum === "object"
    ) {
        values = SPECTRAL_CHANNELS.map(
            channel => payload.spectrum[channel]
        );
    } else {
        throw new Error(
            "Unsupported Milk Test spectrum payload."
        );
    }

    if (!Array.isArray(values) || values.length !== 18) {
        throw new Error(
            "Exactly 18 spectral values are required."
        );
    }

    const spectralValues = values.map(value => {
        if (
            typeof value !== "number" &&
            !(typeof value === "string" && value.trim() !== "")
        ) {
            return NaN;
        }

        return Number(value);
    });

    if (!spectralValues.every(Number.isFinite)) {
        throw new Error(
            "Spectral values must contain valid numbers."
        );
    }

    return spectralValues;
}

// ==========================================
// 6. PARSE MILK TEST DEVICE STATUS
// ==========================================

function parseMilkTestDeviceStatus(buffer) {
    const raw = buffer.toString("utf8").trim();

    try {
        const payload = JSON.parse(raw);

        if (typeof payload === "string") {
            return payload.toLowerCase();
        }

        return String(
            payload?.status || ""
        ).toLowerCase();

    } catch {
        return raw.toLowerCase();
    }
}

// ==========================================
// 7. HANDLE FARMER-SPECIFIC MQTT MESSAGES
// ==========================================

function handleMilkTestMessage(topic, buffer) {

    // The generic milkTest namespace belongs to SensorData.
    // Do not process it as a farmer-specific topic.
    if (topic.startsWith(`${MILK_TEST_TOPIC_ROOT}/`)) {
        return false;
    }

    const topicInfo = getFarmerTopicInfo(topic);

    if (!topicInfo) {
        return false;
    }

    const { farmerCustomId, category } = topicInfo;

    // DEVICE STATUS
    if (category === "status") {
        const status = parseMilkTestDeviceStatus(buffer);

        if (!["running", "offline"].includes(status)) {
            console.warn(
                "Invalid Milk Test device status:",
                status
            );

            mqttEvents.emit("invalidMessage", {
                farmerCustomId,
                topic,
                reason: "Invalid device status"
            });

            return true;
        }

        mqttEvents.emit("deviceStatus", {
            farmerCustomId,
            status,
            topic,
            receivedAt: new Date()
        });

        return true;
    }

    // FARMER-SPECIFIC SPECTRAL DATA
    if (category === "result/spectrum") {
        try {
            const spectralValues =
                parseMilkTestSpectrum(buffer);

            mqttEvents.emit("spectrum", {
                farmerCustomId,
                spectralValues,
                topic,
                receivedAt: new Date()
            });

        } catch (error) {
            console.error(
                "Invalid Milk Test spectral message:",
                error.message
            );

            mqttEvents.emit("invalidMessage", {
                farmerCustomId,
                topic,
                reason: error.message
            });
        }

        return true;
    }

    return false;
}

// ==========================================
// 8. CONNECT TO EXISTING MQTT BROKER
// ==========================================

function connectMQTT() {
    if (mqttClient) {
        return mqttClient;
    }

    if (!BROKER_URL.startsWith("mqtts://")) {
        throw new Error(
            "Use mqtts:// to enforce encrypted MQTT transport."
        );
    }

    if (
        !process.env.MQTT_USERNAME ||
        !process.env.MQTT_PASSWORD
    ) {
        throw new Error(
            "MQTT_USERNAME and MQTT_PASSWORD must be set in .env."
        );
    }

    const caPath = path.resolve(
        process.env.MQTT_CA_PATH ||
        "./certs/mqtt-ca-fixed.pem"
    );

    if (!fs.existsSync(caPath)) {
        throw new Error(
            `MQTT CA file not found: ${caPath}`
        );
    }

    const ca = fs.readFileSync(caPath);

    if (
        !ca.toString("utf8").includes(
            "-----BEGIN CERTIFICATE-----"
        )
    ) {
        throw new Error(
            "MQTT CA file must contain a PEM certificate."
        );
    }

    // Only one MQTT client is created.
    // Both workflows reuse this client.
    const client = mqtt.connect(BROKER_URL, {
        clientId: CLIENT_ID,
        username: process.env.MQTT_USERNAME,
        password: process.env.MQTT_PASSWORD,
        ca,
        rejectUnauthorized: true,
        protocolVersion: 5,
        clean: true,
        reconnectPeriod: 5000,
        connectTimeout: 30000,
        keepalive: 60
    });

    mqttClient = client;

    // MQTT CONNECTED
    client.on("connect", () => {
        mqttConnected = true;

        console.log(
            "AWS Mosquitto connected:",
            BROKER_URL
        );

        console.log(
            "MQTT Client ID:",
            CLIENT_ID
        );

        // One wildcard subscription for both workflows.
        client.subscribe(
            TOPIC_FILTER,
            { qos: 1 },
            (error, granted) => {
                if (error) {
                    console.error(
                        "MQTT subscribe error:",
                        error.message
                    );

                    mqttEvents.emit("subscriptionError", error);
                    return;
                }

                const denied = (granted || []).filter(
                    item => item.qos === 128
                );

                if (denied.length > 0) {
                    console.error(
                        "MQTT subscription denied:",
                        denied.map(item => item.topic)
                    );

                    mqttEvents.emit(
                        "subscriptionError",
                        new Error("MQTT subscription denied.")
                    );

                    return;
                }

                console.log(
                    "MQTT subscribed:",
                    TOPIC_FILTER
                );

                console.log(
                    "SensorData and farmer-specific Milk Test topics are covered."
                );
            }
        );

        mqttEvents.emit("connected");
    });

    // ======================================
    // RECEIVE HARDWARE DATA
    // ======================================

    client.on("message", (topic, buffer) => {

        // 1. First handle farmer-specific Milk Test topics.
        if (handleMilkTestMessage(topic, buffer)) {
            return;
        }

        // 2. Handle device status topics.
        if (
            topic === STATUS_TOPIC ||
            topic === MILK_TEST_STATUS_TOPIC
        ) {
            console.log(
                "Device status:",
                buffer.toString("utf8")
            );

            return;
        }

        // 3. Only generic SensorData spectrum topics
        // are processed by the SensorData collection workflow.
        //
        // Farmer-specific spectrum topics have already been
        // handled above and returned.
        if (
            topic !== MILK_TEST_SPECTRUM_TOPIC &&
            topic !== SPECTRUM_TOPIC
        ) {
            return;
        }

        if (
            !acceptingReadings ||
            !activeMeasurementId
        ) {
            console.log(
                "Spectrum ignored: no active SensorData collection"
            );

            return;
        }

        const measurementId = activeMeasurementId;
        const payloadCopy = Buffer.from(buffer);

        // Serialize database writes to preserve reading order.
        writeQueue = writeQueue
            .then(() =>
                saveMQTTReading(
                    measurementId,
                    payloadCopy
                )
            )
            .catch(error => {
                console.error(
                    "MQTT save error:",
                    error.message
                );
            });
    });

    // MQTT ERROR HANDLING
    client.on("error", error => {
        console.error(
            "MQTT error:",
            error.message
        );

        mqttEvents.emit("mqttError", error);
    });

    client.on("reconnect", () => {
        console.log("MQTT reconnecting...");
        mqttEvents.emit("reconnecting");
    });

    client.on("offline", () => {
        mqttConnected = false;
        console.log("MQTT offline");
        mqttEvents.emit("offline");
    });

    client.on("close", () => {
        mqttConnected = false;
        console.log("MQTT connection closed");
        mqttEvents.emit("disconnected");
    });

    return client;
}

// ==========================================
// 9. RESUME ACTIVE SENSORDATA COLLECTION
// ==========================================

async function resumeActiveCollection() {
    const activeMeasurement = await SensorData.findOne({
        mode: 0,
        status: "running"
    }).sort({ startedAt: -1 });

    if (!activeMeasurement) {
        activeMeasurementId = null;
        acceptingReadings = false;

        console.log("No active SensorData collection to resume.");

        return null;
    }

    activeMeasurementId =
        activeMeasurement._id.toString();

    acceptingReadings = true;

    console.log(
        "Resumed active SensorData collection:",
        activeMeasurementId
    );

    return activeMeasurement;
}

// ==========================================
// 10. PUBLISH MQTT MESSAGE
// ==========================================

function publishTopic(topic, value) {
    return new Promise((resolve, reject) => {

        if (!mqttClient || !mqttClient.connected) {
            return reject(
                new Error("MQTT broker not connected.")
            );
        }

        const payload =
            typeof value === "string"
                ? value
                : String(value);

        mqttClient.publish(
            topic,
            payload,
            { qos: 1, retain: false },
            error => {
                if (error) {
                    console.error(
                        "MQTT publish error:",
                        error.message
                    );

                    return reject(error);
                }

                console.log(
                    "MQTT published:",
                    topic,
                    payload
                );

                resolve({
                    topic,
                    payload
                });
            }
        );
    });
}

// ==========================================
// 11. PUBLISH GENERIC COLLECTION COMMAND
// ==========================================

async function publishCollectionCommand(value) {

    const command = Number(value);

    if (![0, 1].includes(command)) {
        throw new Error(
            "Collection enable value must be 0 (Stop) or 1 (Start)."
        );
    }

    // Same topic for Start and Stop.
    // 1 = Start
    // 0 = Stop
    return publishTopic(
        MILK_TEST_ENABLE_TOPIC,
        command
    );
}

// ==========================================
// 12. START SENSORDATA COLLECTION
// ==========================================

function startCollection(farmerId, mode = 0) {
    return runCollectionOperation(async () => {

        if (!mongoose.Types.ObjectId.isValid(farmerId)) {
            throw new Error("Invalid Farmer ID.");
        }

        if (Number(mode) !== 0) {
            throw new Error(
                "Collection mode must be 0 (Adulteration)."
            );
        }

        if (!mqttClient?.connected) {
            throw new Error(
                "MQTT broker not connected."
            );
        }

        if (activeMeasurementId) {
            throw new Error(
                "A SensorData collection is already active."
            );
        }

        // Check MongoDB for an existing running collection.
        const existing = await SensorData.findOne({
            mode: 0,
            status: "running"
        });

        if (existing) {
            activeMeasurementId =
                existing._id.toString();

            acceptingReadings = true;

            throw new Error(
                "An active SensorData collection already exists."
            );
        }

        // Create the SensorData document first.
        const measurement = await SensorData.create({
            farmerId,
            mode: 0,
            status: "running",
            startedAt: new Date(),
            endsAt: null,
            stoppedAt: null,
            startEntryId: null,
            lastProcessedEntryId: null,
            expectedReadings: null,
            readings: [],
            lastError: null
        });

        activeMeasurementId =
            measurement._id.toString();

        acceptingReadings = true;

        try {
            // Send Start command to generic milkTest topic.
            await publishCollectionCommand(1);

        } catch (error) {
            // Roll back local collection state if publishing fails.
            acceptingReadings = false;
            activeMeasurementId = null;

            await writeQueue;

            await SensorData.deleteOne({
                _id: measurement._id
            });

            throw error;
        }

        console.log(
            "SensorData collection started:",
            activeMeasurementId
        );

        return measurement;
    });
}

// ==========================================
// 13. PARSE SENSORDATA SPECTRUM
// ==========================================

function parseSpectralMessage(message) {
    let payload;

    try {
        payload = JSON.parse(
            message.toString("utf8")
        );
    } catch {
        throw new Error("Invalid JSON spectrum payload.");
    }

    if (
        !payload ||
        typeof payload !== "object" ||
        !payload.spectrum ||
        typeof payload.spectrum !== "object" ||
        Array.isArray(payload.spectrum)
    ) {
        throw new Error(
            "Invalid spectrum payload. Expected { spectrum: { A410, B435, ... } }."
        );
    }

    const spectralValues =
        SPECTRAL_CHANNELS.map(name => {
            const value = payload.spectrum[name];

            if (
                typeof value !== "number" ||
                !Number.isFinite(value)
            ) {
                throw new Error(
                    `Invalid spectrum value: ${name}`
                );
            }

            return value;
        });

    return {
        measuredAt: new Date(),
        spectralValues
    };
}

// ==========================================
// 14. SAVE SENSORDATA SPECTRUM
// ==========================================

async function saveMQTTReading(
    measurementId,
    message
) {
    let reading;

    try {
        reading = parseSpectralMessage(message);

    } catch (error) {
        console.error(
            "Invalid SensorData MQTT reading:",
            error.message
        );

        return;
    }

    const doc = await SensorData.findOneAndUpdate(
        {
            _id: measurementId,
            mode: 0,
            status: "running"
        },
        [
            {
                $set: {
                    lastProcessedEntryId: {
                        $add: [
                            {
                                $ifNull: [
                                    "$lastProcessedEntryId",
                                    0
                                ]
                            },
                            1
                        ]
                    },

                    readings: {
                        $concatArrays: [
                            {
                                $ifNull: [
                                    "$readings",
                                    []
                                ]
                            },
                            [
                                {
                                    entryId: {
                                        $add: [
                                            {
                                                $ifNull: [
                                                    "$lastProcessedEntryId",
                                                    0
                                                ]
                                            },
                                            1
                                        ]
                                    },

                                    measuredAt: {
                                        $literal: reading.measuredAt
                                    },

                                    spectralValues: {
                                        $literal: reading.spectralValues
                                    }
                                }
                            ]
                        ]
                    }
                }
            }
        ],
        {
            new: true
        }
    );

    if (doc) {
        console.log(
            "Saved SensorData spectrum reading:",
            doc.lastProcessedEntryId
        );

    } else {
        console.log(
            "Reading ignored: SensorData collection is no longer running."
        );
    }
}

// ==========================================
// 15. STOP SENSORDATA COLLECTION
// ==========================================

function stopCollection(measurementId) {
    return runCollectionOperation(async () => {

        if (
            !mongoose.Types.ObjectId.isValid(measurementId)
        ) {
            throw new Error("Invalid Measurement ID.");
        }

        if (
            !activeMeasurementId ||
            activeMeasurementId !== String(measurementId)
        ) {
            throw new Error(
                "This is not the active SensorData collection."
            );
        }

        if (!mqttClient?.connected) {
            throw new Error(
                "MQTT broker not connected."
            );
        }

        // First send Stop command to hardware.
        // If publishing fails, retain the active collection state.
        await publishCollectionCommand(0);

        // Stop accepting new readings.
        acceptingReadings = false;
        activeMeasurementId = null;

        // Wait until all already queued readings are saved.
        await writeQueue;

        const stoppedAt = new Date();

        const measurement =
            await SensorData.findOneAndUpdate(
                {
                    _id: measurementId,
                    mode: 0,
                    status: "running"
                },
                {
                    $set: {
                        status: "completed",
                        stoppedAt,
                        endsAt: stoppedAt
                    }
                },
                {
                    new: true,
                    runValidators: true
                }
            );

        if (!measurement) {
            throw new Error(
                "Collection not found or already stopped."
            );
        }

        console.log(
            "SensorData collection stopped:",
            measurementId
        );

        return measurement;
    });
}

// ==========================================
// 16. GET ACTIVE SENSORDATA COLLECTION
// ==========================================

function getActiveCollection() {
    if (!activeMeasurementId) {
        return Promise.resolve(null);
    }

    return SensorData.findOne({
        _id: activeMeasurementId,
        mode: 0,
        status: "running"
    });
}

// ==========================================
// 17. EXISTING SENSOR COMMAND
// ==========================================

async function publishSensorCommand(field1, field2) {

    if (
        ![0, 1].includes(field1) ||
        ![0, 1].includes(field2)
    ) {
        throw new Error(
            "Invalid field1 or field2 value."
        );
    }

    const payload = JSON.stringify({
        field1,
        field2
    });

    await publishTopic(
        SENSOR_COMMAND_TOPIC,
        payload
    );

    return {
        topic: SENSOR_COMMAND_TOPIC,
        field1,
        field2
    };
}

// ==========================================
// 18. MILK TEST - PUBLISH MODE
// ==========================================

async function publishMode(farmerCustomId, mode) {

    if (![0, 1].includes(Number(mode))) {
        throw new Error("Mode must be 0 or 1.");
    }

    const topic = getFarmerTopic(
        farmerCustomId,
        "control/mode"
    );

    return publishTopic(
        topic,
        Number(mode)
    );
}

// ==========================================
// 19. MILK TEST - PUBLISH ENABLE / STOP
// ==========================================

async function publishEnable(farmerCustomId, value) {

    if (![0, 1].includes(Number(value))) {
        throw new Error("Enable value must be 0 or 1.");
    }

    const topic = getFarmerTopic(
        farmerCustomId,
        "control/enable"
    );

    return publishTopic(
        topic,
        Number(value)
    );
}

// ==========================================
// 20. MILK TEST - PUBLISH FINAL PREDICTION
// ==========================================

async function publishPrediction(farmerCustomId, prediction) {

    if (
        !prediction ||
        ![0, 1].includes(Number(prediction.mode))
    ) {
        throw new Error(
            "Invalid Milk Test prediction."
        );
    }

    const topic = getFarmerTopic(
        farmerCustomId,
        "result/predict"
    );

    return publishTopic(
        topic,
        JSON.stringify(prediction)
    );
}

// ==========================================
// 21. GET SHARED MQTT STATUS
// ==========================================

function getMQTTStatus() {
    return {
        connected: Boolean(
            mqttClient?.connected && mqttConnected
        ),
        clientId: CLIENT_ID,
        broker: BROKER_URL,
        topicRoot: TOPIC_ROOT
    };
}

// ==========================================
// 22. EXPORT ALL FUNCTIONS
// ==========================================

module.exports = {

    // Shared MQTT connection
    connectMQTT,

    // SensorData collection workflow
    resumeActiveCollection,
    startCollection,
    stopCollection,
    getActiveCollection,
    publishSensorCommand,

    // Farmer-specific Milk Test workflow
    getFarmerTopic,
    publishMode,
    publishEnable,
    publishPrediction,

    // Shared MQTT status and events
    getMQTTStatus,
    mqttEvents

};
