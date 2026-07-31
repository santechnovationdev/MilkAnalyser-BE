const Express = require('express')
const UserModel = require('../models/User')
const isAuth = require('../middleware/isAuth')
const MilkPredict = require("../models/MilkCollection");

const AuthRouter = Express.Router()

AuthRouter.post('/login', async (req, res) => {
    const { email, password } = req.body;

    console.log("Login attempt with email:", email);
    if (!email || !password) {
        return res.send({ success: false, message: 'Please provide all details!' });
    }
    // 1. Try Admin/SuperAdmin
    const user = await UserModel.findOne({ email });

    console.log("user", user)

    if (user) {
        if (user.password !== password) {
            return res.send({ success: false, message: "Invalid Password!" });
        }

        req.session.user = {
            id: user._id,
            fullname: user.fullname,
            email: user.email,
            contact: user.contact,
            role: user.role, // 'SuperAdmin' or 'Admin'
        };

        return req.session.save((err) => {
            if (err) return res.send({ success: false, message: "Session error!" });
            return res.send({ success: true, message: "login successfully", userType: user.role, user: req.session.user });
        });
    }
    // Not found in any model
    return res.send({ success: false, message: 'User not found!' });
});



// Register 
AuthRouter.post('/register', async (req, res) => {
    try {
        const {fullname,email, contact, password,role,  village } = req.body;

        if (!fullname || !email || !contact || !password) {
            return res.send({ success: false, message: 'Please provide all details!' })
        }

        const fetchUser = await UserModel.findOne({ email: email.toLowerCase() })
        if (fetchUser) {
            return res.send({ success: false, message: 'Account already exist! Please try login.' })
        }

        // const fetchCandidate = await CandidateModel.findOne({ email: email.toLowerCase() })

        // if (fetchUser) {
        //     return res.send({ success: false, message: 'Account already exist! Please try login.' })
        // }

        let Users = await UserModel.find({});
        let userId;
        if (Users.length > 0) {
            let last_user = Users.slice(-1)[0];
            userId = last_user.id + 1;
        } else {
            userId = 1
        }



        const newUser = new UserModel({
            id: userId,
            fullname: fullname,
            email: email,
            contact: contact,
            password: password,
            village:village,
            role: role || 'admin'
        })

        const saveUser = await newUser.save()

        if (saveUser) {
            return res.send({ success: true, message: "User Registration successfully!" })
        } else {
            return res.send({ success: false, message: 'Failed to create User!' })
        }
    }
    catch (err) {
        console.log("Error in Register:", err)
        return res.send({ success: false, message: 'Trouble in Registration! Please contact admin.' })
    }
})

// Check Auth
AuthRouter.get('/checkauth', isAuth, async (req, res) => {
    try {
        if (req.session.user) {
            const email = req.session.user.email.toLowerCase();
            const role = req.session.user.role;


            const fetchUser = await UserModel.findOne({ email });

            // const candidateFetch = await CandidateModel.findOne({ email });

            if (!fetchUser ) {
                return res.send({ success: false, message: 'User not found!' });
            }

            return res.send({ success: true, user: fetchUser, message: 'Successfully fetched the logged-in user!' });
        } else {
            return res.send({ success: false, message: 'No login detected! Please login and try again.' });
        }
    } catch (err) {
        console.error('Error in checking authentication:', err);
        return res.send({ success: false, message: 'Trouble checking authentication! Please contact support.' });
    }
});


AuthRouter.get('/logout', isAuth, async (req, res) => {
    try {
        if (req.session.user) {
            req.session.destroy((err) => {
                if (err) {
                    console.log("Error in destroying session:", err);
                    return res.send({ success: false, message: "Failed to log out! Please contact developer." });
                }
                return res.send({ success: true, message: "Logged out successfully!" });
            });
        }
        else {
            return res.send({ success: false, message: "Please login and try again later!" })
        }
    }
    catch (err) {
        console.log("Trouble in logging out:", err)
        return res.send({ success: false, message: "Trouble in logging out! Please contact support Team." })
    }
})

AuthRouter.get("/farmers", isAuth, async (req, res) => {
    try {

        const farmers = await UserModel.find(
            { role: "farmer" },
            {
                password: 0,
                __v: 0
            }
        ).sort({ createdAt: -1 });

        return res.send({
            success: true,
            farmers,
            total: farmers.length
        });

    } catch (err) {

        console.log("Error fetching farmers:", err);

        return res.send({
            success: false,
            message: "Failed to fetch farmers!"
        });

    }
});


AuthRouter.get("/getfarmer/:id", isAuth, async (req, res) => {
    try {

        const { id } = req.params;
        console.log(id)

        const farmer = await UserModel.findById(id).select("-password -__v");

        if (!farmer) {
            return res.send({
                success: false,
                message: "Farmer not found!"
            });
        }

        const milkRecords = await MilkPredict.find({
            farmerId: id
        }).sort({ createdAt: -1 });

        const latestRecord = milkRecords[0] || null;

        return res.send({
            success: true,
            farmer,
            totalRecords: milkRecords.length,
            latestRecord
        });

    } catch (err) {

        console.log(err);

        return res.send({
            success: false,
            message: "Failed to fetch farmer!"
        });

    }
});


AuthRouter.put("/farmer/:id", isAuth, async (req, res) => {

    try {

        const { id } = req.params;

        const {
            fullname,
            email,
            contact,
            role,
            village
        } = req.body;

        const farmer = await UserModel.findById(id);

        if (!farmer) {

            return res.send({
                success: false,
                message: "Farmer not found!"
            });

        }

        farmer.fullname = fullname;
        farmer.email = email;
        farmer.contact = contact;
        farmer.role = role;
        farmer.village = village;

        await farmer.save();

        return res.send({

            success: true,

            message: "Farmer updated successfully.",

            farmer

        });

    }

    catch (err) {

        console.log(err);

        return res.send({

            success: false,

            message: "Failed to update farmer."

        });

    }

});


AuthRouter.delete("/farmer/:id", isAuth, async (req, res) => {

    try {

        const { id } = req.params;

        const farmer = await UserModel.findById(id);

        if (!farmer) {

            return res.send({

                success: false,

                message: "Farmer not found."

            });

        }

        await UserModel.findByIdAndDelete(id);

        return res.send({

            success: true,

            message: "Farmer deleted successfully."

        });

    }

    catch (err) {

        console.log(err);

        return res.send({

            success: false,

            message: "Failed to delete farmer."

        });

    }

});

module.exports = AuthRouter