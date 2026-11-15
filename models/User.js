
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    // MongoDB automatically generates _id.

    userId: {
        type: String,
        unique: true,
        required: true,
        trim: true,
        index: true
    },

    fullname: {
        type: String,
        required: true,
        trim: true
    },

    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },

    contact: {
        type: Number,
        required: true
    },

    role: {
        type: String,
        enum: ["farmer", "admin"],
        required: true,
        default: "farmer",
        lowercase: true,
        trim: true
    },

    password: {
        type: String,
        required: true
    },

    village: {
        type: String,
        trim: true,
        default: ""
    }

}, {
    timestamps: true
});

const userModel = mongoose.model("users", userSchema);

module.exports = userModel;
