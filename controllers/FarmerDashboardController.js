
"use strict";

const MilkTestSession = require("../models/MilkTestSession");
const MilkPrediction = require("../models/MilkPrediction");

const getFarmerDashboard = async (req, res) => {
    try {
        const farmerId = req.session?.user?.id;

        if (!farmerId) {
            return res.status(401).json({
                success: false,
                message: "Please log in to view your dashboard.",
            });
        }

        if (req.session?.user?.role !== "farmer") {
            return res.status(403).json({
                success: false,
                message: "Only farmers can access this dashboard.",
            });
        }

        // 1. Fetch ALL completed tests for this farmer.
        // Mode 0 = Adulteration
        // Mode 1 = Milk Analysis

        const sessions = await MilkTestSession.find({
            farmerId,
            mode: { $in: [0, 1] },
            status: "COMPLETED",
        })
            .sort({ completedAt: -1, createdAt: -1 })
            .lean();

        if (!sessions.length) {
            return res.status(200).json({
                success: true,
                message: "No completed milk test records found.",

                summary: {
                    fat: 0,
                    snf: 0,
                    water: 0,
                },

                testSummary: {
                    totalTests: 0,
                    milkAnalysisTests: 0,
                    adulterationTests: 0,
                },

                trends: {
                    categories: [],
                    fat: [],
                    snf: [],
                    water: [],
                },

                history: [],
                totalRecords: 0,
            });
        }

        // 2. Fetch predictions for all completed sessions.

        const sessionIds = sessions.map(
            session => session._id
        );

        const predictions = await MilkPrediction.find({
            testId: { $in: sessionIds },
        }).lean();

        const predictionMap = new Map(
            predictions.map(prediction => [
                String(prediction.testId),
                prediction,
            ])
        );

        // 3. Build history with the correct test mode.

        const history = sessions
            .map(session => {
                const prediction = predictionMap.get(
                    String(session._id)
                );

                if (!prediction) return null;

                const isAnalysis = Number(session.mode) === 1;

                return {
                    _id: session._id,
                    testId: session._id,

                    // Essential for frontend test identification.
                    mode: Number(session.mode),

                    testType: isAnalysis
                        ? "Milk Analysis"
                        : "Adulteration",

                    sampleType: prediction.sampleType,

                    date:
                        session.completedAt ||
                        prediction.predictedAt ||
                        session.createdAt,

                    // Milk analysis values.
                    fat: isAnalysis && Number.isFinite(Number(prediction.fat))
                        ? Number(prediction.fat)
                        : null,

                    snf: isAnalysis && Number.isFinite(Number(prediction.snf))
                        ? Number(prediction.snf)
                        : null,

                    water: isAnalysis && Number.isFinite(Number(prediction.water))
                        ? Number(prediction.water)
                        : null,

                    // Adulteration values.
                    adulterationType: !isAnalysis
                        ? prediction.adulterationType || null
                        : null,

                    confidence: !isAnalysis
                        ? prediction.adulterationConfidence ??
                        prediction.confidence ??
                        null
                        : null,

                    status: session.status,
                    totalReadings: session.totalReadings || 0,
                };
            })
            .filter(Boolean);

        // 4. Separate the two test types.

        const analysisHistory = history.filter(
            item => item.mode === 1
        );

        const adulterationHistory = history.filter(
            item => item.mode === 0
        );

        // 5. Latest Milk Analysis prediction.

        const latestAnalysis = analysisHistory[0] || {
            fat: 0,
            snf: 0,
            water: 0,
        };

        // 6. Test counts.

        const testSummary = {
            totalTests: history.length,
            milkAnalysisTests: analysisHistory.length,
            adulterationTests: adulterationHistory.length,
        };

        // 7. Build date-wise trends using Milk Analysis records only.
        // History is newest first, so reverse for chronological charts.

        const chartHistory = analysisHistory
            .slice(0, 30)
            .reverse();

        const categories = chartHistory.map(item => {
            const date = new Date(item.date);

            return date.toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
            });
        });

        const trends = {
            categories,

            fat: chartHistory.map(item => item.fat),
            snf: chartHistory.map(item => item.snf),
            water: chartHistory.map(item => item.water),
        };

        // 8. Return complete farmer dashboard data.

        return res.status(200).json({
            success: true,
            message: "Farmer dashboard retrieved successfully.",

            summary: {
                fat: latestAnalysis.fat ?? 0,
                snf: latestAnalysis.snf ?? 0,
                water: latestAnalysis.water ?? 0,
            },

            testSummary,

            trends,

            history,

            totalRecords: history.length,
        });

    } catch (error) {
        console.error("Farmer Dashboard Error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load farmer dashboard.",
        });
    }
};

module.exports = {
    getFarmerDashboard,
};
