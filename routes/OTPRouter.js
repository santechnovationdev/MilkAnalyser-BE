const nodemailer = require('nodemailer')
const otpmodel = require('../models/OtpModel')

const Express = require('express');


const app = Express.Router()


// ✅ Send OTP

app.post("/send-otp", async (req, res) => {

    try {

        const { email } = req.body;

        const query = { email };

        console.log(query)

        let user = await otpmodel.findOne(
            query.email
            && { email: query.email }

        );

        if (!user) {
            user = new otpmodel({ email: email });
        }
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        const expiryTime = new Date(Date.now() + 2 * 60 * 1000); // 120 sec

        user.otp = otp;
        user.otpExpiry = expiryTime; // ✅ FIXED
        user.isVerified = false;

        await user.save();

        console.log("OTP:", otp);
        console.log("Current Time:", Date.now());
        console.log("Expiry Time:", expiryTime.getTime());

        // resend restriction (optional fix)
        if (user.lastOtpSent && Date.now() - user.lastOtpSent < 30000) {
            return res.json({
                success: false,
                message: "Wait 30 seconds before requesting new OTP"
            });
        }

        user.lastOtpSent = Date.now();
        await user.save();
        // =========================================
        // CREATE OR REPLACE RECORD
        // =========================================

        if (!user) {

            user = new otpmodel(query);

        }

        // Replace old OTP data
        user.otp = otp;
        user.otpExpiry = expiryTime;
        user.lastOtpSent = new Date();
        user.isVerified = false;

        await user.save();


        // ✅ SEND BASED ON TYPE

        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.User_email,
                pass: process.env.User_passkey
            }
        });

        await transporter.sendMail({
            to: email,
            subject: "OTP Verification",
            text: `Your OTP is ${otp}. It expires in 2 minutes.`
        });
        return res.json({
            success: true,
            message: "OTP sent successfully",

        });


    } catch (err) {
        console.log(err);
        res.status(500).send({ success: false });
    }

});


app.post("/verify-otp", async (req, res) => {

    try {
        const { email, otp } = req.body;
        console.log("verify:", email)

        const query = email
     
        const user = await otpmodel.findOne({ email: query });

        if (!user) {
            return res.json({ success: false, message: "User not found" });
        }

        // ❌ Check OTP exists
        if (!user.otp) {
            return res.json({ success: false, message: "No OTP found" });
        }

        // ✅ MOST IMPORTANT: Expiry check FIRST
        if (!user.otpExpiry || Date.now() > new Date(user.otpExpiry).getTime()) {
            return res.json({ success: false, message: "OTP expired" });
        }

        // ✅ Only if NOT expired → check OTP
        if (String(user.otp) !== String(otp)) {
            return res.json({ success: false, message: "Invalid OTP" });
        }

        user.isVerified = true;
        //  user.otp = null;
        //  user.otpExpiry = null;

        await user.save();

        res.json({ success: true, message: "OTP verified" });

    } catch (err) {
        console.log(err);
        res.status(500).send({ success: false });
    }
});

module.exports = app