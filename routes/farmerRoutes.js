const express = require("express");
const router = express.Router();

const {
    getFarmerDashboard
} = require("../controllers/farmerController");

const  isFarmer  = require("../middleware/isFarmer"); // or your auth middleware

router.get("/report", isFarmer, getFarmerDashboard);

module.exports = router;