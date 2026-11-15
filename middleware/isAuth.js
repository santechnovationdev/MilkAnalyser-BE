
const isAuth = (req, res, next) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({
            success: false,
            message: "Please login and try again."
        });
    }

    next();
};

module.exports = isAuth;
