
"use strict";

const UserModel = require("../models/User");
const MilkTestSession = require("../models/MilkTestSession");
const MilkPrediction = require("../models/MilkPrediction");

const getAdminDashboard = async (req, res) => {
    try {
        if (req.user?.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Admin access required.",
            });
        }

        // ----------------------------------------
        // 1. BASIC COUNTS
        // ----------------------------------------

        const [
            totalFarmers,
            totalTests,
            completedTests,
            failedTests,
            milkAnalysisTests,
            adulterationTests,
        ] = await Promise.all([
            UserModel.countDocuments({ role: "farmer" }),

            MilkTestSession.countDocuments({}),

            MilkTestSession.countDocuments({
                status: "COMPLETED",
            }),

            MilkTestSession.countDocuments({
                status: "FAILED",
            }),

            MilkTestSession.countDocuments({
                mode: 1,
                status: "COMPLETED",
            }),

            MilkTestSession.countDocuments({
                mode: 0,
                status: "COMPLETED",
            }),
        ]);

        // ----------------------------------------
        // 2. COMPLETED MILK ANALYSIS SESSIONS
        // ----------------------------------------

        const analysisSessions = await MilkTestSession.find({
            mode: 1,
            status: "COMPLETED",
        })
            .select("_id")
            .lean();

        const analysisTestIds = analysisSessions.map(
            (session) => session._id
        );

        // ----------------------------------------
        // 3. FETCH MILK ANALYSIS PREDICTIONS
        // ----------------------------------------

        const analysisPredictions = analysisTestIds.length
            ? await MilkPrediction.find({
                testId: { $in: analysisTestIds },
            })
                .select("testId fat snf water createdAt")
                .lean()
            : [];

        // ----------------------------------------
        // 4. CALCULATE AVERAGES
        // ----------------------------------------

        const getAverage = (items, field) => {
            const values = items
                .map((item) => Number(item[field]))
                .filter((value) => Number.isFinite(value));

            if (!values.length) return 0;

            return Number(
                (
                    values.reduce((total, value) => total + value, 0) /
                    values.length
                ).toFixed(2)
            );
        };

        const averageFat = getAverage(analysisPredictions, "fat");
        const averageSNF = getAverage(analysisPredictions, "snf");
        const averageWater = getAverage(analysisPredictions, "water");

        // ----------------------------------------
        // 5. COMPLETION PERCENTAGE
        // ----------------------------------------

        const completionPercentage = totalTests
            ? Number(((completedTests / totalTests) * 100).toFixed(1))
            : 0;

        // ----------------------------------------
        // 6. RECENT TEST SESSIONS
        // ----------------------------------------

        const recentSessions = await MilkTestSession.find({})
            .sort({ createdAt: -1 })
            .limit(10)
            .populate(
                "farmerId",
                "userId fullname contact village"
            )
            .lean();

        const recentTestIds = recentSessions.map(
            (session) => session._id
        );

        const recentPredictions = recentTestIds.length
            ? await MilkPrediction.find({
                testId: { $in: recentTestIds },
            }).lean()
            : [];

        const predictionMap = new Map(
            recentPredictions.map((prediction) => [
                String(prediction.testId),
                prediction,
            ])
        );

        const recentTests = recentSessions.map((session) => {
            const prediction = predictionMap.get(
                String(session._id)
            ) || null;

            return {
                _id: session._id,

                farmer: session.farmerId
                    ? {
                        userId: session.farmerId.userId,
                        fullname: session.farmerId.fullname,
                        contact: session.farmerId.contact,
                        village: session.farmerId.village,
                    }
                    : null,

                mode: session.mode,
                status: session.status,

                totalReadings: session.totalReadings || 0,

                startedAt: session.startedAt,
                completedAt: session.completedAt,
                createdAt: session.createdAt,

                prediction: prediction
                    ? {
                        fat: prediction.fat ?? null,
                        snf: prediction.snf ?? null,
                        water: prediction.water ?? null,

                        adulterationType:
                            prediction.adulterationType ?? null,

                        confidence:
                            prediction.confidence ?? null,
                    }
                    : null,
            };
        });

        // ----------------------------------------
        // 7. RESPONSE
        // ----------------------------------------

        return res.status(200).json({
            success: true,
            message: "Admin dashboard data retrieved successfully.",

            cards: {
                totalFarmers,
                totalTests,
                completedTests,
                failedTests,
                completionPercentage,

                averageFat,
                averageSNF,
                averageWater,
            },

            chart: {
                milkAnalysis: milkAnalysisTests,
                adulteration: adulterationTests,
                failed: failedTests,
            },

            recentTests,
        });

    } catch (error) {
        console.error("Admin Dashboard Error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve admin dashboard data.",
        });
    }
};

module.exports = {
    getAdminDashboard,
};
