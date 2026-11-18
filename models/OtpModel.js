const mongoose = require('mongoose')


const otpSchema = mongoose.Schema({
    email: { type: String },
    otp: { type: Number },
    otpExpiry: { type: Date },
    lastOtpSent: { type: Number },
    isVerified: { type: Boolean, default: false }
}, { timestamps: true });

const Otpmodel = mongoose.model('Epicotp', otpSchema)

module.exports = Otpmodel;