const express = require("express");
const router = express.Router();

const { getDashboardData } = require("../controllers/dashboardController");
const isAuth = require("../middleware/isAuth");

router.get("/dashboard", isAuth, getDashboardData);

module.exports = router;