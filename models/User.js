const mongoose = require('mongoose')

const userSchema = mongoose.Schema({
    id: { type: Number, required: true, trim: true },
    fullname: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    contact: { type: Number, required: true },
    role: { type: String, enum: ['farmer', 'admin'], required: true, default: 'admin' },
    password: { type: String, required: true },
    village: { type: String, required: false },
}, {
    timestamps: true
})

const userModel = mongoose.model('users', userSchema)

module.exports = userModel
