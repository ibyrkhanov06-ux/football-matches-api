module.exports = (role) => (req, res, next) => {
  const user = req.session?.user;
  if (!user) return res.status(401).json({ message: "Not authenticated" });
  if (user.role !== role) return res.status(403).json({ message: "Forbidden" });
  next();
};
