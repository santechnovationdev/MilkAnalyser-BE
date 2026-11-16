
"use strict";

const mongoose = require("mongoose");

const UserModel = require("../models/User");
const MilkTestSession = require("../models/MilkTestSession");
const MilkTestReading = require("../models/MilkTestReading");
const MilkPrediction = require("../models/MilkPrediction");

const milkTestService = require("../services/milkTestService");

// ============================================
// 1. COMMON HELPER FUNCTIONS
// ============================================

// Get authenticated user's MongoDB ID.
// Supports both req.user._id and req.user.id.
const getRequesterId = (req) => {
    return req.user?._id || req.user?.id;
};

// Get authenticated user's custom ID.
const getRequesterCustomId = (req) => {
    return req.user?.userId;
};

// Validate MongoDB ObjectId.
const isValidId = (id) => {
    return Boolean(id) && mongoose.Types.ObjectId.isValid(id);
};

// Check whether the logged-in user can access a test.
const checkTestAccess = (req, session) => {
    if (!session || !req.user) {
        return false;
    }

    if (req.user.role === "admin") {
        return true;
    }

    const requesterId = getRequesterId(req);

    return (
        req.user.role === "farmer" &&
        String(session.farmerId?._id || session.farmerId) ===
            String(requesterId)
    );
};

// Find a farmer using either MongoDB ID or custom userId.
const findFarmerByIdentifier = async (identifier) => {
    if (!identifier) {
        return null;
    }

    const conditions = [
        {
            userId: String(identifier).trim()
        }
    ];

    if (isValidId(identifier)) {
        conditions.push({
            _id: identifier
        });
    }

    return UserModel.findOne({
        role: "farmer",
        $or: conditions
    });
};

// Common pagination helper.
const getPagination = (query) => {
    const page = Math.max(
        1,
        Number.parseInt(query.page, 10) || 1
    );

    const limit = Math.min(
        100,
        Math.max(
            1,
            Number.parseInt(query.limit, 10) || 10
        )
    );

    return {
        page,
        limit,
        skip: (page - 1) * limit
    };
};

// Common prediction lookup.
const getPredictionMap = async (testIds) => {
    if (!testIds.length) {
        return new Map();
    }

    const predictions = await MilkPrediction.find({
        testId: {
            $in: testIds
        }
    }).lean();

    return new Map(
        predictions.map(item => [
            String(item.testId),
            item
        ])
    );
};

// ============================================
// 2. GET DEVICE STATUS
// ============================================

const getDeviceStatus = async (req, res) => {
    try {
        const deviceStatus =
            await milkTestService.getDeviceStatus();

        return res.status(200).json({
            success: true,
            data: deviceStatus
        });

    } catch (err) {
        console.error(
            "Get Device Status Error:",
            err
        );

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve device status."
        });
    }
};

// ============================================
// 3. START MILK TEST
// ============================================

const startMilkTest = async (req, res) => {
    try {
        const {
            mode,
            farmerId,
            farmerCustomId
        } = req.body;

        // Validate mode.
        if (
            ![0, 1].includes(Number(mode)) ||
            mode === "" ||
            mode === null ||
            mode === undefined
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid mode. Use 0 for Adulteration or 1 for Analysis."
            });
        }

        const requesterId = getRequesterId(req);

        if (!requesterId || !isValidId(requesterId)) {
            return res.status(401).json({
                success: false,
                message: "Invalid authenticated user."
            });
        }

        let farmer = null;

        // ------------------------------------
        // FARMER STARTS OWN TEST
        // ------------------------------------

        if (req.user.role === "farmer") {
            farmer = await UserModel.findOne({
                _id: requesterId,
                role: "farmer"
            });
        }

        // ------------------------------------
        // ADMIN SELECTS FARMER
        // ------------------------------------

        else if (req.user.role === "admin") {
            const selectedFarmer = farmerCustomId || farmerId;

            if (!selectedFarmer) {
                return res.status(400).json({
                    success: false,
                    message: "Please select a farmer."
                });
            }

            farmer = await findFarmerByIdentifier(
                selectedFarmer
            );
        }

        else {
            return res.status(403).json({
                success: false,
                message:
                    "You are not authorized to start a milk test."
            });
        }

        if (!farmer) {
            return res.status(404).json({
                success: false,
                message: "Selected farmer not found."
            });
        }

        if (!farmer.userId) {
            return res.status(400).json({
                success: false,
                message:
                    "Selected farmer does not have a custom user ID."
            });
        }

        // ------------------------------------
        // START TEST SERVICE
        // ------------------------------------

        const testSession = await milkTestService.startTest({
            farmerId: farmer._id,
            farmerCustomId: farmer.userId,
            requestedBy: requesterId,
            requestedByRole: req.user.role,
            mode: Number(mode)
        });

        return res.status(201).json({
            success: true,
            message: "Milk test started successfully.",
            data: testSession
        });

    } catch (err) {
        console.error(
            "Start Milk Test Error:",
            err
        );

        return res.status(err.statusCode || 500).json({
            success: false,
            message:
                err.message || "Unable to start milk test."
        });
    }
};

// ============================================
// 4. STOP MILK TEST
// ============================================

const stopMilkTest = async (req, res) => {
    try {
        const { testId } = req.body;

        if (!testId || !isValidId(testId)) {
            return res.status(400).json({
                success: false,
                message: "Valid testId is required."
            });
        }

        const session = await MilkTestSession.findById(
            testId
        );

        if (!session) {
            return res.status(404).json({
                success: false,
                message: "Milk test session not found."
            });
        }

        // Check ownership.
        if (!checkTestAccess(req, session)) {
            return res.status(403).json({
                success: false,
                message:
                    "You cannot stop another farmer's test."
            });
        }

        // if (!["STARTING", "RUNNING"].includes(session.status)) {
        //     return res.status(400).json({
        //         success: false,
        //         message:
        //             `Cannot stop test with status ${session.status}.`
        //     });
        // }

        // Stop the active hardware test.
        const result = await milkTestService.stopTest({
            testId: String(session._id),
            requestedBy: getRequesterId(req),
            requestedByRole: req.user.role
        });

        return res.status(200).json({
            success: true,
            message:
                "Milk test stopped and prediction processed successfully.",
            data: result
        });

    } catch (err) {
        console.error(
            "Stop Milk Test Error:",
            err
        );

        return res.status(err.statusCode || 500).json({
            success: false,
            message:
                err.message || "Unable to stop milk test."
        });
    }
};

// ============================================
// 5. GET ACTIVE TEST
// ============================================

const getActiveTest = async (req, res) => {
    try {
        const activeStatuses = [
            "STARTING",
            "RUNNING",
            "STOPPING",
            "PROCESSING"
        ];

        let filter = {
            status: {
                $in: activeStatuses
            }
        };

        // Farmers can only retrieve their own active test.
        if (req.user.role === "farmer") {
            filter.farmerId = getRequesterId(req);
        }

        const session = await MilkTestSession.findOne(
            filter
        )
            .sort({
                createdAt: -1
            })
            .populate(
                "farmerId",
                "userId fullname email contact village"
            )
            .populate(
                "requestedBy",
                "userId fullname email role"
            );

        if (!session) {
            return res.status(200).json({
                success: true,
                message: "No active milk test.",
                data: null
            });
        }

        return res.status(200).json({
            success: true,
            data: session
        });

    } catch (err) {
        console.error(
            "Get Active Test Error:",
            err
        );

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve active test."
        });
    }
};

// ============================================
// 6. GET LIVE SENSOR READINGS
// ============================================

const getLiveReadings = async (req, res) => {
    try {
        const { testId } = req.params;

        if (!isValidId(testId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid test ID."
            });
        }

        const session = await MilkTestSession.findById(
            testId
        );

        if (!session) {
            return res.status(404).json({
                success: false,
                message: "Test session not found."
            });
        }

        if (!checkTestAccess(req, session)) {
            return res.status(403).json({
                success: false,
                message: "Access denied."
            });
        }

        const readings = await MilkTestReading.find({
            testId: session._id
        })
            .sort({
                sequenceNumber: 1
            })
            .limit(1000)
            .lean();

        return res.status(200).json({
            success: true,
            totalReadings: readings.length,
            data: readings
        });

    } catch (err) {
        console.error(
            "Get Live Readings Error:",
            err
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to retrieve sensor readings."
        });
    }
};

// ============================================
// 7. GET FARMER TEST HISTORY
// ============================================

const getFarmerTestHistory = async (req, res) => {
    try {
        const requesterId = getRequesterId(req);

        if (
            req.user.role !== "farmer" ||
            !requesterId ||
            !isValidId(requesterId)
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "Only authenticated farmers can access this history."
            });
        }

        const {
            page,
            limit,
            skip
        } = getPagination(req.query);

        const filter = {
            farmerId: requesterId
        };

        if (req.query.mode !== undefined) {
            if (![0, 1].includes(Number(req.query.mode))) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid test mode."
                });
            }

            filter.mode = Number(req.query.mode);
        }

        const [sessions, total] = await Promise.all([
            MilkTestSession.find(filter)
                .sort({
                    createdAt: -1
                })
                .skip(skip)
                .limit(limit)
                .populate(
                    "requestedBy",
                    "userId fullname role"
                )
                .lean(),

            MilkTestSession.countDocuments(filter)
        ]);

        const testIds = sessions.map(
            item => item._id
        );

        const predictionMap =
            await getPredictionMap(testIds);

        const history = sessions.map(session => ({
            ...session,
            prediction:
                predictionMap.get(String(session._id)) || null
        }));

        return res.status(200).json({
            success: true,

            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            },

            data: history
        });

    } catch (err) {
        console.error(
            "Farmer Test History Error:",
            err
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to retrieve farmer test history."
        });
    }
};

// ============================================
// 8. GET INDIVIDUAL TEST DETAILS
// ============================================

const getTestDetails = async (req, res) => {
    try {
        const { testId } = req.params;

        if (!isValidId(testId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid test ID."
            });
        }

        const session = await MilkTestSession.findById(
            testId
        )
            .populate(
                "farmerId",
                "userId fullname email contact village"
            )
            .populate(
                "requestedBy",
                "userId fullname email role"
            );

        if (!session) {
            return res.status(404).json({
                success: false,
                message: "Test session not found."
            });
        }

        if (!checkTestAccess(req, session)) {
            return res.status(403).json({
                success: false,
                message: "Access denied."
            });
        }

        const [readings, prediction] = await Promise.all([
            MilkTestReading.find({
                testId: session._id
            })
                .sort({
                    sequenceNumber: 1
                })
                .lean(),

            MilkPrediction.findOne({
                testId: session._id
            }).lean()
        ]);

        return res.status(200).json({
            success: true,

            data: {
                session,
                readings,
                prediction
            }
        });

    } catch (err) {
        console.error(
            "Get Test Details Error:",
            err
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to retrieve test details."
        });
    }
};

// ============================================
// 9. ADMIN - GET ALL FARMER TESTS
// ============================================

const getAllFarmerTests = async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Admin access required."
            });
        }

        const {
            page,
            limit,
            skip
        } = getPagination(req.query);

        const filter = {};

        if (req.query.mode !== undefined) {
            if (![0, 1].includes(Number(req.query.mode))) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid test mode."
                });
            }

            filter.mode = Number(req.query.mode);
        }

        if (req.query.status) {
            const allowedStatuses = [
                "STARTING",
                "RUNNING",
                "STOPPING",
                "PROCESSING",
                "COMPLETED",
                "FAILED"
            ];

            if (!allowedStatuses.includes(req.query.status)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid test status."
                });
            }

            filter.status = req.query.status;
        }

        // Admin may filter by MongoDB ID or custom farmer ID.
        if (req.query.farmerId) {
            const farmer = await findFarmerByIdentifier(
                req.query.farmerId
            );

            if (!farmer) {
                return res.status(404).json({
                    success: false,
                    message: "Farmer not found."
                });
            }

            filter.farmerId = farmer._id;
        }

        const [sessions, total] = await Promise.all([
            MilkTestSession.find(filter)
                .sort({
                    createdAt: -1
                })
                .skip(skip)
                .limit(limit)
                .populate(
                    "farmerId",
                    "userId fullname email contact village"
                )
                .populate(
                    "requestedBy",
                    "userId fullname email role"
                )
                .lean(),

            MilkTestSession.countDocuments(filter)
        ]);

        const testIds = sessions.map(
            item => item._id
        );

        const predictionMap =
            await getPredictionMap(testIds);

        const results = sessions.map(session => ({
            ...session,
            prediction:
                predictionMap.get(String(session._id)) || null
        }));

        return res.status(200).json({
            success: true,

            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            },

            data: results
        });

    } catch (err) {
        console.error(
            "Admin All Tests Error:",
            err
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to retrieve all milk test results."
        });
    }
};

// ============================================
// 10. ADMIN - GET SELECTED FARMER TESTS
// ============================================

const getSelectedFarmerTests = async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Admin access required."
            });
        }

        // farmerId route parameter can be either:
        // FARMER001 or MongoDB ObjectId.
        const { farmerId } = req.params;

        if (!farmerId) {
            return res.status(400).json({
                success: false,
                message: "Farmer ID is required."
            });
        }

        const farmer = await findFarmerByIdentifier(
            farmerId
        );

        if (!farmer) {
            return res.status(404).json({
                success: false,
                message: "Farmer not found."
            });
        }

        const {
            page,
            limit,
            skip
        } = getPagination(req.query);

        const filter = {
            farmerId: farmer._id
        };

        if (req.query.mode !== undefined) {
            if (![0, 1].includes(Number(req.query.mode))) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid test mode."
                });
            }

            filter.mode = Number(req.query.mode);
        }

        const [sessions, total] = await Promise.all([
            MilkTestSession.find(filter)
                .sort({
                    createdAt: -1
                })
                .skip(skip)
                .limit(limit)
                .populate(
                    "requestedBy",
                    "userId fullname role"
                )
                .lean(),

            MilkTestSession.countDocuments(filter)
        ]);

        const testIds = sessions.map(
            item => item._id
        );

        const predictionMap =
            await getPredictionMap(testIds);

        const results = sessions.map(session => ({
            ...session,
            prediction:
                predictionMap.get(String(session._id)) || null
        }));

        return res.status(200).json({
            success: true,

            farmer: {
                _id: farmer._id,
                userId: farmer.userId,
                fullname: farmer.fullname,
                email: farmer.email,
                contact: farmer.contact,
                village: farmer.village
            },

            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            },

            data: results
        });

    } catch (err) {
        console.error(
            "Selected Farmer Tests Error:",
            err
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to retrieve selected farmer tests."
        });
    }
};

// ============================================
// 11. EXPORT CONTROLLERS
// ============================================

module.exports = {
    getDeviceStatus,
    startMilkTest,
    stopMilkTest,
    getActiveTest,
    getLiveReadings,
    getFarmerTestHistory,
    getTestDetails,
    getAllFarmerTests,
    getSelectedFarmerTests
};
