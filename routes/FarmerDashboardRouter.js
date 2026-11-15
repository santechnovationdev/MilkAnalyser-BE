
const express = require("express");
const router = express.Router();

const {
    getFarmerDashboard,
} = require("../controllers/FarmerDashboardController");

const isAuth = require("../middleware/isAuth");

router.get(
    "/",
    isAuth,
    getFarmerDashboard
);

module.exports = router;
