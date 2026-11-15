
"use strict";

// ============================================
// SHARED MQTT SERVICE
// ============================================

// Reuse the existing MQTT connection from mqttxService.
// Do not create another MQTT client here.

const mqttService = require("./mqttxService");

// ============================================
// EXPORT MILK TEST MQTT FUNCTIONS
// ============================================

module.exports = {

    // Publish test mode: 0 = Adulteration, 1 = Analysis
    publishMode: mqttService.publishMode,

    // Publish enable: 1 = Start, 0 = Stop
    publishEnable: mqttService.publishEnable,

    // Publish final prediction to hardware, if required
    publishPrediction: mqttService.publishPrediction,

    // Get the shared MQTT connection status
    getMQTTStatus: mqttService.getMQTTStatus,

    // Listen to incoming farmer-specific MQTT messages
    mqttEvents: mqttService.mqttEvents

};
