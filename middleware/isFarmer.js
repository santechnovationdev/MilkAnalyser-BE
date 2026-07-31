const UserModel = require("../models/User");

const isFarmer = async (req, res, next) => {

    try {

        if (!req.session.user) {

            return res.send({
                success: false,
                message: "Please login to access this page!"
            });

        }

        if (req.session.user.role !== "farmer") {

            return res.send({
                success: false,
                message: "Access denied! Farmers only."
            });

        }

        const fetchUser = await UserModel.findOne({
            email: req.session.user.email.toLowerCase()
        });

        if (!fetchUser) {

            return res.send({
                success: false,
                message: "User not found!"
            });

        }

        req.user = fetchUser;

        next();

    }
    catch (err) {

        console.log("Error in isFarmer:", err);

        return res.send({
            success: false,
            message: "Trouble in checking Authentication!"
        });

    }

};

module.exports = isFarmer;