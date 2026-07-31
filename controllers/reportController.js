const MilkPredict = require("../models/MilkCollection");


// ======================================================
// Summary Report
// ======================================================

const getSummary = async (req, res) => {

    try {

        const summary = await MilkPredict.aggregate([
            {
                $group: {
                    _id: null,

                    totalAnalyses: { $sum: 1 },

                    averageFat: { $avg: "$fat" },

                    averageSNF: { $avg: "$snf" },

                    averageProtein: { $avg: "$protein" },

                    averageWater: { $avg: "$water" },

                    goodQuality: {
                        $sum: {
                            $cond: [
                                { $eq: ["$quality", "Good"] },
                                1,
                                0
                            ]
                        }
                    }
                }
            }
        ]);

        if (!summary.length) {

            return res.status(200).json({
                success: true,
                summary: {
                    totalAnalyses: 0,
                    averageFat: 0,
                    averageSNF: 0,
                    averageProtein: 0,
                    averageWater: 0,
                    goodQuality: 0
                }
            });

        }

        const data = summary[0];

        return res.status(200).json({
            success: true,
            summary: {
                totalAnalyses: data.totalAnalyses,
                averageFat: Number(data.averageFat.toFixed(2)),
                averageSNF: Number(data.averageSNF.toFixed(2)),
                averageProtein: Number(data.averageProtein.toFixed(2)),
                averageWater: Number(data.averageWater.toFixed(2)),
                goodQuality: data.goodQuality
            }
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            message: err.message
        });

    }

};


// ======================================================
// Quality Distribution
// ======================================================

const getQualityDistribution = async (req, res) => {

    try {

        const quality = await MilkPredict.aggregate([
            {
                $group: {
                    _id: "$quality",
                    count: { $sum: 1 }
                }
            }
        ]);

        let result = {
            Good: 0,
            Average: 0,
            Poor: 0
        };

        quality.forEach(item => {

            if (item._id) {

                result[item._id] = item.count;

            }

        });

        return res.status(200).json({
            success: true,
            quality: result
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            message: err.message
        });

    }

};


// ======================================================
// Farmer Wise Average Fat
// ======================================================

const getFarmerComparison = async (req, res) => {

    try {

        const farmers = await MilkPredict.aggregate([

            {
                $group: {
                    _id: "$farmerId",

                    averageFat: {
                        $avg: "$fat"
                    }
                }
            },

            {
                $lookup: {
                    from: "users",
                    localField: "_id",
                    foreignField: "_id",
                    as: "farmer"
                }
            },

            {
                $unwind: "$farmer"
            },

            {
                $project: {
                    _id: 0,
                    farmer: "$farmer.fullname",
                    averageFat: {
                        $round: ["$averageFat", 2]
                    }
                }
            },

            {
                $sort: {
                    averageFat: -1
                }
            }

        ]);

        return res.status(200).json({
            success: true,
            farmers
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            message: err.message
        });

    }

};


// ======================================================
// Overall Trends
// ======================================================

const getTrends = async (req, res) => {

    try {

        const trends = await MilkPredict.find()
            .sort({ createdAt: 1 });

        const fat = [];
        const snf = [];
        const protein = [];
        const water = [];
        const temperature = [];

        trends.forEach(item => {

            const date = item.createdAt.toISOString().split("T")[0];

            fat.push({
                date,
                value: item.fat
            });

            snf.push({
                date,
                value: item.snf
            });

            protein.push({
                date,
                value: item.protein
            });

            water.push({
                date,
                value: item.water
            });

            temperature.push({
                date,
                value: item.temp
            });

        });

        return res.status(200).json({
            success: true,
            fat,
            snf,
            protein,
            water,
            temperature
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            message: err.message
        });

    }

};


module.exports = {

    getSummary,

    getQualityDistribution,

    getFarmerComparison,

    getTrends

};