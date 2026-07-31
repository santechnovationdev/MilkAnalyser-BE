const mongoose = require("mongoose");
const MilkPredict = require("../models/MilkCollection");

const getFarmerDashboard = async (req, res) => {

    try {

        const farmerId = req.user._id;

        const reports = await MilkPredict
            .find({ farmerId })
            .sort({ createdAt: -1 });

        if (!reports.length) {

            return res.json({
                success: true,
                summary: {
                    fat: 0,
                    protein: 0,
                    snf: 0,
                    water: 0
                },
                trends: {
                    categories: [],
                    fat: [],
                    protein: [],
                    snf: [],
                    water: []
                },
                history: []
            });

        }

        const latest = reports[0];

        const history = reports.slice(0, 10).map(item => ({

            date: item.createdAt.toLocaleDateString(),

            fat: item.fat,

            protein: item.protein,

            snf: item.snf,

            water: item.water,

            quality: item.quality

        }));

        const categories = reports
            .slice()
            .reverse()
            .map(item =>
                new Date(item.createdAt).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short"
                })
            );

        const trends = {

            categories,

            fat: reports.slice().reverse().map(i => i.fat),

            protein: reports.slice().reverse().map(i => i.protein),

            snf: reports.slice().reverse().map(i => i.snf),

            water: reports.slice().reverse().map(i => i.water)

        };

        res.json({

            success: true,

            summary: {

                fat: latest.fat,

                protein: latest.protein,

                snf: latest.snf,

                water: latest.water

            },

            trends,

            history

        });

    }

    catch (error) {

        console.log(error);

        res.status(500).json({

            success: false,

            message: error.message

        });

    }

};

module.exports = {

    getFarmerDashboard

};