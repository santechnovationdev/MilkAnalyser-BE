
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

        // 1. Fetch only this farmer's completed milk analysis sessions.
        const sessions = await MilkTestSession.find({
            farmerId,
            mode: 1,
            status: "COMPLETED",
        })
            .sort({ completedAt: -1, createdAt: -1 })
            .lean();

        if (!sessions.length) {
            return res.status(200).json({
                success: true,
                message: "No completed milk analysis records found.",
                summary: {
                    fat: 0,
                    snf: 0,
                    water: 0,
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

        // 2. Fetch predictions belonging to these sessions.
        const sessionIds = sessions.map((session) => session._id);

        const predictions = await MilkPrediction.find({
            testId: { $in: sessionIds },
        }).lean();

        const predictionMap = new Map(
            predictions.map((prediction) => [
                String(prediction.testId),
                prediction,
            ])
        );

        // 3. Build history with actual predictions.
        const history = sessions
            .map((session) => {
                const prediction = predictionMap.get(
                    String(session._id)
                );

                if (!prediction) return null;

                const fat = Number(prediction.fat);
                const snf = Number(prediction.snf);
                const water = Number(prediction.water);

                return {
                    _id: session._id,
                    testId: session._id,

                    date: session.completedAt || session.createdAt,

                    fat: Number.isFinite(fat) ? fat : null,
                    snf: Number.isFinite(snf) ? snf : null,
                    water: Number.isFinite(water) ? water : null,

                    status: session.status,
                    totalReadings: session.totalReadings || 0,
                };
            })
            .filter(Boolean);

        // 4. Latest completed prediction.
        const latest = history[0] || {
            fat: 0,
            snf: 0,
            water: 0,
        };

        // 5. Date-wise chart data.
        // Keep the latest 30 records and display oldest to newest.
        const chartHistory = history
            .slice(0, 30)
            .reverse();

        const categories = chartHistory.map((item) =>
            new Date(item.date).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
            })
        );

        const trends = {
            categories,
            fat: chartHistory.map((item) => item.fat ?? 0),
            snf: chartHistory.map((item) => item.snf ?? 0),
            water: chartHistory.map((item) => item.water ?? 0),
        };

        // 6. Send dashboard response.
        return res.status(200).json({
            success: true,
            message: "Farmer dashboard retrieved successfully.",

            summary: {
                fat: latest.fat ?? 0,
                snf: latest.snf ?? 0,
                water: latest.water ?? 0,
            },

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
