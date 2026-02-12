require("dotenv").config();

const path = require("path");
const express = require("express");
const session = require("express-session");

const authRoutes = require("./routes/auth.routes");
const tournamentsRoutes = require("./routes/tournaments.routes");
const matchesRoutes = require("./routes/matches.routes");
const itemsRoutes = require("./routes/items");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// logger
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// static
const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));

// root
app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// sessions
app.set("trust proxy", 1);
app.use(
  session({
    name: "sid",
    secret: process.env.SESSION_SECRET || "change_me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 2, // 2h
    },
  })
);

// routes
app.use("/api/auth", authRoutes);
app.use("/api/tournaments", tournamentsRoutes);
app.use("/api/matches", matchesRoutes);

// items (previous tasks)
app.use("/api/items", (req, res, next) => {
  // itemsRoutes is a factory that needs a collection; injected in server.js
  if (!req.app.locals.itemsCollection) {
    return res.status(500).json({ error: "Items collection not initialized" });
  }
  return itemsRoutes(req.app.locals.itemsCollection)(req, res, next);
});

app.get("/api/version", (req, res) => {
  res.status(200).json({
    name: "football-matches-api",
    version: "2.0.0",
    deployedAt: new Date().toISOString(),
  });
});

// 404 for API
app.use("/api", (req, res) => {
  res.status(404).json({ error: "API route not found" });
});

module.exports = app;
