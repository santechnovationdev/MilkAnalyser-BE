const express = require("express");
const router = express.Router();

const {
    getSummary,
    getQualityDistribution,
    getFarmerComparison,
    getTrends
} = require("../controllers/reportController");

router.get("/summary", getSummary);

router.get("/quality", getQualityDistribution);

router.get("/farmer-comparison", getFarmerComparison);

router.get("/trends", getTrends);

module.exports = router;