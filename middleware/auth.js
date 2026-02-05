module.exports = function (req, res, next) {
    const key = req.headers["x-api-key"];

    if (!key || key !== "SECRET123") {
        return res.status(401).json({ message: "Unauthorized" });
    }

    next();
};
