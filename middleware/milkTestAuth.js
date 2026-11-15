
const UserModel = require("../models/User");

// ========================================
// AUTHENTICATED USER
// ========================================

const isAuthenticated = async (req, res, next) => {
    try {
        if (!req.session?.user?.email) {
            return res.status(401).json({
                success: false,
                message: "Please login to access this page!"
            });
        }

        const fetchUser = await UserModel.findOne({
            email: req.session.user.email.toLowerCase()
        });

        if (!fetchUser) {
            return res.status(401).json({
                success: false,
                message: "User not found!"
            });
        }

        req.user = fetchUser;

        next();

    } catch (err) {
        console.log("Milk Test Authentication Error:", err);

        return res.status(500).json({
            success: false,
            message: "Trouble in checking authentication!"
        });
    }
};

// ========================================
// FARMER ONLY
// ========================================

const isFarmer = (req, res, next) => {
    if (req.user?.role !== "farmer") {
        return res.status(403).json({
            success: false,
            message: "Access denied! Farmers only."
        });
    }

    next();
};

// ========================================
// ADMIN ONLY
// ========================================

const isAdmin = (req, res, next) => {
    if (req.user?.role !== "admin") {
        return res.status(403).json({
            success: false,
            message: "Access denied! Admins only."
        });
    }

    next();
};

module.exports = {
    isAuthenticated,
    isFarmer,
    isAdmin
};
