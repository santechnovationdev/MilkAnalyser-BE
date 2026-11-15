
const UserModel = require("../models/User");

const isFarmer = async (req, res, next) => {
    try {
        if (!req.session?.user?.email) {
            return res.status(401).json({
                success: false,
                message: "Please login and try again."
            });
        }

        const user = await UserModel.findOne({
            email: req.session.user.email.toLowerCase()
        });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "User not found."
            });
        }

        if (user.role !== "farmer") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Farmers only."
            });
        }

        req.user = user;
        next();

    } catch (error) {
        console.error("Farmer authentication error:", error);

        return res.status(500).json({
            success: false,
            message: "Authentication failed."
        });
    }
};

module.exports = isFarmer;
