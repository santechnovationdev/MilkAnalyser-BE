
const Counter = require("../models/Counter");

const generateUserId = async (role) => {
    const normalizedRole = String(role).toLowerCase();

    let prefix;

    if (normalizedRole === "admin") {
        prefix = "AD";
    } else if (normalizedRole === "farmer") {
        prefix = "FARMER";
    } else {
        throw new Error("Invalid user role");
    }

    const counter = await Counter.findOneAndUpdate(
        { _id: normalizedRole },
        { $inc: { sequence: 1 } },
        {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true
        }
    );

    return `${prefix}${String(counter.sequence).padStart(3, "0")}`;
};

module.exports = generateUserId;
