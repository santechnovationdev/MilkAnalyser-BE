
const express = require("express");
const router = express.Router();

const {
    getAdminDashboard,
} = require("../controllers/DashboardController");

const {
    isAuthenticated,
    isAdmin,
} = require("../middleware/milkTestAuth");

router.get(
    "/admin",
    isAuthenticated,
    isAdmin,
    getAdminDashboard
);

module.exports = router;
