const UserModel = require("../models/User");
const MilkCollection = require("../models/MilkCollection");
const SensorData = require("../models/SensorData");

const getDashboardData = async (req, res) => {

    try {

        /* ---------------------------------
           Total Farmers
        ---------------------------------- */

        const totalFarmers = await UserModel.countDocuments({
            role: "farmer"
        });

        /* ---------------------------------
           Today's Collection
        ---------------------------------- */

        const start = new Date();
        start.setHours(0, 0, 0, 0);

        const end = new Date();
        end.setHours(23, 59, 59, 999);

        const todayCollection = await MilkCollection.aggregate([
            {
                $match: {
                    createdAt: {
                        $gte: start,
                        $lte: end
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    quantity: {
                        $sum: "$quantity"
                    }
                }
            }
        ]);

        /* ---------------------------------
           Average Fat, Protein & SNF
        ---------------------------------- */

        const averages = await MilkCollection.aggregate([
            {
                $group: {
                    _id: null,
                    averageFat: {
                        $avg: "$fat"
                    },
                    averageProtein: {
                        $avg: "$protein"
                    },
                    averageSNF: {
                        $avg: "$snf"
                    }
                }
            }
        ]);

        /* ---------------------------------
           Quality Chart
        ---------------------------------- */

        const qualityResult = await MilkCollection.aggregate([
            {
                $group: {
                    _id: "$quality",
                    total: {
                        $sum: 1
                    }
                }
            }
        ]);

        const qualityChart = {
            good: 0,
            average: 0,
            poor: 0
        };

        qualityResult.forEach((item) => {

            if (item._id === "Good") {
                qualityChart.good = item.total;
            }

            if (item._id === "Average") {
                qualityChart.average = item.total;
            }

            if (item._id === "Poor") {
                qualityChart.poor = item.total;
            }

        });

        /* ---------------------------------
           Quality Percentage
        ---------------------------------- */

        const totalRecords = await MilkCollection.countDocuments();

        const goodRecords = await MilkCollection.countDocuments({
            quality: "Good"
        });

        const qualityPercentage =
            totalRecords > 0
                ? Number(((goodRecords / totalRecords) * 100).toFixed(2))
                : 0;

        /* ---------------------------------
           Weekly Collection Trend
        ---------------------------------- */

        const lastWeek = new Date();
        lastWeek.setDate(lastWeek.getDate() - 6);
        lastWeek.setHours(0, 0, 0, 0);

        const trendResult = await MilkCollection.aggregate([
            {
                $match: {
                    createdAt: {
                        $gte: lastWeek
                    }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: "%d-%m",
                            date: "$createdAt"
                        }
                    },
                    quantity: {
                        $sum: "$quantity"
                    }
                }
            },
            {
                $sort: {
                    _id: 1
                }
            }
        ]);

        const collectionTrend = {
            labels: trendResult.map(item => item._id),
            data: trendResult.map(item => item.quantity)
        };

        /* ---------------------------------
           Recent Collections
        ---------------------------------- */

        const recentCollections = await MilkCollection.find()
            .populate("farmerId", "fullname contact")
            .select("quantity fat protein snf water quality adulteration createdAt")
            .sort({
                createdAt: -1
            })
            .limit(5);

        /* ---------------------------------
           Latest Sensor Data
        ---------------------------------- */

        const latestSensor = await SensorData.findOne()
            .sort({
                createdAt: -1
            });

        /* ---------------------------------
           Response
        ---------------------------------- */

        return res.status(200).json({

            success: true,

            cards: {

                totalFarmers,

                todayCollection:
                    todayCollection.length > 0
                        ? todayCollection[0].quantity
                        : 0,

                averageFat:
                    averages.length > 0
                        ? Number(averages[0].averageFat.toFixed(2))
                        : 0,

                averageProtein:
                    averages.length > 0
                        ? Number(averages[0].averageProtein.toFixed(2))
                        : 0,

                averageSNF:
                    averages.length > 0
                        ? Number(averages[0].averageSNF.toFixed(2))
                        : 0,

                qualityPercentage

            },

            qualityChart,

            collectionTrend,

            recentCollections,

            latestSensor: latestSensor
                ? {
                    temperature: latestSensor.temperature,
                    ultrasonic: latestSensor.ultrasonic,
                    spectral: latestSensor.spectral
                }
                : null

        });

    }

    catch (err) {

        console.log(err);

        return res.status(500).json({

            success: false,

            message: err.message

        });

    }

};

module.exports = {
    getDashboardData
};