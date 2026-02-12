const express = require("express");
const bcrypt = require("bcrypt");

const router = express.Router();

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { email, password, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "email and password required" });
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail.includes("@") || String(password).length < 6) {
      return res
        .status(400)
        .json({ message: "Invalid email or password too short (min 6)" });
    }

    const users = db.collection("users");
    const existing = await users.findOne({ email: normalizedEmail });
    if (existing) return res.status(409).json({ message: "Email already exists" });

    // Final requires roles: user/admin
    const safeRole = role === "admin" ? "admin" : "user";

    const passwordHash = await bcrypt.hash(String(password), 10);
    const doc = {
      email: normalizedEmail,
      passwordHash,
      role: safeRole,
      createdAt: new Date(),
    };

    const result = await users.insertOne(doc);

    // auto-login
    req.session.user = {
      id: result.insertedId.toString(),
      email: doc.email,
      role: doc.role,
    };

    res.status(201).json({ message: "Registered", role: doc.role });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "email and password required" });
    }

    const normalizedEmail = normalizeEmail(email);
    const user = await db.collection("users").findOne({ email: normalizedEmail });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    req.session.user = {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    res.status(200).json({ message: "Logged in", role: user.role });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/auth/logout
router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("sid");
    res.status(200).json({ message: "Logged out" });
  });
});

// GET /api/auth/me
router.get("/me", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  res.status(200).json({ user: req.session.user });
});

module.exports = router;
