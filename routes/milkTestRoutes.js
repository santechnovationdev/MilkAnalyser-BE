
const express = require("express");
const router = express.Router();

const {
    startMilkTest,
    stopMilkTest,
    getDeviceStatus,
    getActiveTest,
    getLiveReadings,
    getFarmerTestHistory,
    getTestDetails,
    getAllFarmerTests,
    getSelectedFarmerTests
} = require("../controllers/milkTestController");

// Replace this import with your actual session authentication
// middleware filename and exported function.
const {
    isAuthenticated,
    isAdmin,
    isFarmer
} = require("../middleware/milkTestAuth");

// ========================================
// DEVICE STATUS
// ========================================

// Check shared Milk Analyzer hardware status
router.get(
    "/device-status",
    isAuthenticated,
    getDeviceStatus
);

// ========================================
// START / STOP MILK TEST
// ========================================

// Start adulteration or milk analysis test
router.post(
    "/start",
    isAuthenticated,
    startMilkTest
);

// Stop active test and trigger prediction
router.post(
    "/stop",
    isAuthenticated,
    stopMilkTest
);

// ========================================
// ACTIVE TEST
// ========================================

// Get current active test
router.get(
    "/active",
    isAuthenticated,
    getActiveTest
);

// ========================================
// LIVE SENSOR READINGS
// ========================================

// Get readings for an active test
router.get(
    "/live-readings/:testId",
    isAuthenticated,
    getLiveReadings
);

// ========================================
// FARMER TEST HISTORY
// ========================================

// Farmer can view their own test history
router.get(
    "/my-history",
    isAuthenticated,
    isFarmer,
    getFarmerTestHistory
);
// ========================================
// INDIVIDUAL TEST DETAILS
// ========================================

// View a particular test and its prediction
router.get(
    "/details/:testId",
    isAuthenticated,
    getTestDetails
);

// ========================================
// ADMIN ROUTES
// ========================================

// Admin can view all farmers' test results
router.get(
    "/admin/all-tests",
    isAuthenticated,
    isAdmin,
    getAllFarmerTests
);

router.get(
    "/admin/farmer/:farmerId",
    isAuthenticated,
    isAdmin,
    getSelectedFarmerTests
);

module.exports = router;
