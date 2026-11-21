
const express = require("express");
const mongoose = require("mongoose");

const { downloadPredictionPdf } = require("../controllers/predictionPdfController");

const MilkPrediction = require("../models/MilkPrediction");
const User = require("../models/User");

const router = express.Router();

// =======================================
// DOWNLOAD MILK PREDICTION PDF
// =======================================

router.get("/:testId/download-pdf", async (req, res, next) => {
    try {
        const { testId } = req.params;

        // Validate Test ID
        if (!mongoose.isValidObjectId(testId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid test ID"
            });
        }

        // Session authentication
        const sessionUser = req.session?.user;

        if (!sessionUser) {
            return res.status(401).json({
                success: false,
                message: "Authentication required"
            });
        }
        // =======================================
        // GET PREDICTION FROM MilkPrediction MODEL
        // =======================================

        const prediction = await MilkPrediction.findOne({
            $or: [
                { testId: new mongoose.Types.ObjectId(testId) },
                { _id: new mongoose.Types.ObjectId(testId) }
            ]
        }).lean();

        // const predictionCount = await MilkPrediction.countDocuments();

        // const recentPredictions = await MilkPrediction.find()
        //     .select("_id testId farmerId mode predictionStatus createdAt")
        //     .sort({ createdAt: -1 })
        //     .limit(5)
        //     .lean();

        if (!prediction) {
            return res.status(404).json({
                success: false,
                message: "Prediction not found"
            });
        }

        // =======================================
        // GET FARMER FROM User MODEL
        // =======================================

        const farmer = await User.findById(prediction.farmerId)
            .select("userId fullname contact village")
            .lean();

        if (!farmer) {
            return res.status(404).json({
                success: false,
                message: "Farmer not found"
            });
        }

        // =======================================
        // AUTHORIZATION
        // =======================================

        // Adapt this identity extraction to your existing
        // session structure if it uses another field.
        const loggedInUserId = sessionUser._id || sessionUser.id;

        const isOwner = loggedInUserId && String(loggedInUserId) === String(farmer._id);

        // Do not trust a role supplied by the browser.
        // Confirm admin status from the database.
        let isAdmin = false;

        if (loggedInUserId && mongoose.isValidObjectId(loggedInUserId)) {
            const loggedInUser = await User.findById(loggedInUserId)
                .select("role").lean();

            isAdmin = loggedInUser?.role === "admin";
        }

        if (!isOwner && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: "Access denied"
            });
        }

        // =======================================
        // MAP FARMER AND PREDICTION DATA
        // =======================================

        res.locals.pdfData = {
            testId,
            farmer: {
                farmerId: farmer.userId,
                name: farmer.fullname,
                contact: farmer.contact,
                village: farmer.village
            },
            prediction: {
                mode: prediction.mode,

                snf: prediction.snf,
                fat: prediction.fat,
                water: prediction.water,

                sampleType: prediction.sampleType,
                sampleTypeConfidence:
                    prediction.sampleTypeConfidence,

                requiresMilk: prediction.requiresMilk,
                message: prediction.message,

                adulterationPresent:
                    prediction.adulterationPresent,

                adulterationType:
                    prediction.adulterationType,

                adulterationConfidence:
                    prediction.adulterationConfidence,

                predictionStatus:
                    prediction.predictionStatus,

                createdAt: prediction.createdAt
            }
        };

        return downloadPredictionPdf(req, res, next);

    } catch (error) {
        console.error("Prediction PDF Route Error:", error);

        next(error);
    }
});

module.exports = router;
