
const Express = require("express");
const UserModel = require("../models/User");
const isAuth = require("../middleware/isAuth");
const MilkPredict = require("../models/MilkCollection");
const generateUserId = require("../utils/generateUserId");

const AuthRouter = Express.Router();

// Admin authorization helper
const isAdmin = (req, res) => {
    if (req.session?.user?.role !== "admin") {
        res.status(403).send({
            success: false,
            message: "Only an admin can perform this action!"
        });
        return false;
    }

    return true;
};


const mongoose = require("mongoose");
const { log } = require("@tensorflow/tfjs");

const findFarmerByIdentifier = async (id) => {
    let farmer = null;

    // First, check whether the identifier is a valid MongoDB ObjectId.
    if (mongoose.Types.ObjectId.isValid(id)) {
        farmer = await UserModel.findOne({
            _id: id,
            role: "farmer"
        });
    }

    // If not found, search using the custom userId.
    if (!farmer) {
        farmer = await UserModel.findOne({
            userId: id,
            role: "farmer"
        });
    }

    return farmer;
};




// LOGIN
AuthRouter.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).send({
                success: false,
                message: "Please provide all details!"
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        const user = await UserModel.findOne({
            email: normalizedEmail
        });

        if (!user) {
            return res.status(404).send({
                success: false,
                message: "User not found!"
            });
        }

        if (user.password !== password) {
            return res.status(401).send({
                success: false,
                message: "Invalid Password!"
            });
        }

        req.session.user = {
            id: user._id,
            userId: user.userId,
            fullname: user.fullname,
            email: user.email,
            contact: user.contact,
            role: user.role
        };

        return req.session.save((err) => {
            if (err) {
                console.error("Session error:", err);

                return res.status(500).send({
                    success: false,
                    message: "Session error!"
                });
            }

            return res.send({
                success: true,
                message: "Login successfully",
                userType: user.role,
                user: req.session.user
            });
        });

    } catch (err) {
        console.error("Login error:", err);

        return res.status(500).send({
            success: false,
            message: "Trouble during login!"
        });
    }
});


// REGISTER
AuthRouter.post("/register", async (req, res) => {
    try {
        const {
            fullname,
            email,
            contact,
            password,
            role,
            village
        } = req.body;

        if (!fullname || !email || !contact || !password) {
            return res.status(400).send({
                success: false,
                message: "Please provide all required details!"
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        const selectedRole = String(role || "farmer")
            .trim()
            .toLowerCase();

        if (!["admin", "farmer"].includes(selectedRole)) {
            return res.status(400).send({
                success: false,
                message: "Invalid user role!"
            });
        }

        // // Only an authenticated admin can create admin accounts.
        // if (selectedRole === "admin" && !isAdmin(req, res)) {
        //     return;
        // }

        const existingUser = await UserModel.findOne({
            email: normalizedEmail
        });

        if (existingUser) {
            return res.status(409).send({
                success: false,
                message: "Account already exists! Please try login."
            });
        }

        // Generate custom ID independently for each role.
        const customUserId = await generateUserId(selectedRole);

        const newUser = new UserModel({
            userId: customUserId,
            fullname: fullname.trim(),
            email: normalizedEmail,
            contact: Number(contact),
            password,
            village: village?.trim() || "",
            role: selectedRole
        });

        const savedUser = await newUser.save();

        return res.status(201).send({
            success: true,
            message: "User registered successfully!",
            user: {
                _id: savedUser._id,
                userId: savedUser.userId,
                fullname: savedUser.fullname,
                email: savedUser.email,
                contact: savedUser.contact,
                role: savedUser.role,
                village: savedUser.village
            }
        });

    } catch (err) {
        console.error("Error in Register:", err);

        if (err.code === 11000) {
            return res.status(409).send({
                success: false,
                message: "Email or User ID already exists."
            });
        }

        return res.status(500).send({
            success: false,
            message: "Trouble in Registration!"
        });
    }
});


// CHECK AUTH
AuthRouter.get("/checkauth", isAuth, async (req, res) => {
    try {
        const email = req.session.user.email.toLowerCase();

        const fetchUser = await UserModel.findOne({
            email
        }).select("-password -__v");

        if (!fetchUser) {
            return res.status(404).send({
                success: false,
                message: "User not found!"
            });
        }

        return res.send({
            success: true,
            user: fetchUser,
            message: "Successfully fetched the logged-in user!"
        });

    } catch (err) {
        console.error("Error checking authentication:", err);

        return res.status(500).send({
            success: false,
            message: "Trouble checking authentication!"
        });
    }
});


// LOGOUT
AuthRouter.get("/logout", isAuth, async (req, res) => {
    try {
        req.session.destroy((err) => {
            if (err) {
                console.error("Logout error:", err);

                return res.status(500).send({
                    success: false,
                    message: "Failed to log out!"
                });
            }

            return res.send({
                success: true,
                message: "Logged out successfully!"
            });
        });

    } catch (err) {
        console.error("Logout error:", err);

        return res.status(500).send({
            success: false,
            message: "Trouble logging out!"
        });
    }
});


// GET ALL FARMERS
AuthRouter.get("/farmers", isAuth, async (req, res) => {
    try {
        if (!isAdmin(req, res)) return;

        const farmers = await UserModel.find(
            { role: "farmer" },
            { password: 0, __v: 0 }
        ).sort({ createdAt: -1 });

        return res.send({
            success: true,
            farmers,
            total: farmers.length
        });

    } catch (err) {
        console.error("Error fetching farmers:", err);

        return res.status(500).send({
            success: false,
            message: "Failed to fetch farmers!"
        });
    }
});


// GET FARMER DETAILS USING CUSTOM USER ID
AuthRouter.get("/getfarmer/:id", isAuth, async (req, res) => {
    try {
        if (!isAdmin(req, res)) return;

        const { id } = req.params;

        const farmer = await UserModel.findOne({
            userId: id,
            role: "farmer"
        }).select("-password -__v");

        if (!farmer) {
            return res.status(404).send({
                success: false,
                message: "Farmer not found!"
            });
        }

        // Use MongoDB _id for existing milk record relationships.
        const milkRecords = await MilkPredict.find({
            farmerId: farmer._id
        }).sort({ createdAt: -1 });

        return res.send({
            success: true,
            farmer,
            totalRecords: milkRecords.length,
            latestRecord: milkRecords[0] || null
        });

    } catch (err) {
        console.error("Error fetching farmer:", err);

        return res.status(500).send({
            success: false,
            message: "Failed to fetch farmer!"
        });
    }
});

// UPDATE FARMER USING MONGODB _id OR CUSTOM userId
AuthRouter.put("/farmerEdit/:id", isAuth, async (req, res) => {
    try {
        if (!isAdmin(req, res)) return;
console.log("Request body:",req.body);
        const { id } = req.params;

        const {
            fullname,
            email,
            contact,
            village
        } = req.body;

        const farmer = await findFarmerByIdentifier(id);

        if (!farmer) {
            return res.status(404).send({
                success: false,
                message: "Farmer not found!"
            });
        }

        if (email !== undefined) {
            const normalizedEmail = email.trim().toLowerCase();

            const existingUser = await UserModel.findOne({
                email: normalizedEmail,
                _id: { $ne: farmer._id }
            });

            if (existingUser) {
                return res.status(409).send({
                    success: false,
                    message: "Email already exists!"
                });
            }

            farmer.email = normalizedEmail;
        }

        if (fullname !== undefined) {
            farmer.fullname = fullname.trim();
        }

        if (contact !== undefined) {
            farmer.contact = Number(contact);
        }

        if (village !== undefined) {
            farmer.village = village.trim();
        }

        await farmer.save();

        return res.send({
            success: true,
            message: "Farmer updated successfully!",
            farmer: {
                _id: farmer._id,
                userId: farmer.userId,
                fullname: farmer.fullname,
                email: farmer.email,
                contact: farmer.contact,
                role: farmer.role,
                village: farmer.village
            }
        });

    } catch (err) {
        console.error("Error updating farmer:", err);

        return res.status(500).send({
            success: false,
            message: "Failed to update farmer!"
        });
    }
});


// DELETE FARMER USING CUSTOM USER ID
// DELETE FARMER USING MONGODB _id OR CUSTOM userId
AuthRouter.delete("/farmerDelete/:id", isAuth, async (req, res) => {
    try {
        if (!isAdmin(req, res)) return;

        const { id } = req.params;
console.log("Deleting farmer with identifier:", id);
        const farmer = await findFarmerByIdentifier(id);

        if (!farmer) {
            return res.status(404).send({
                success: false,
                message: "Farmer not found!"
            });
        }

        await UserModel.findByIdAndDelete(farmer._id);

        return res.send({
            success: true,
            message: "Farmer deleted successfully!"
        });

    } catch (err) {
        console.error("Error deleting farmer:", err);

        return res.status(500).send({
            success: false,
            message: "Failed to delete farmer!"
        });
    }
});



module.exports = AuthRouter;
