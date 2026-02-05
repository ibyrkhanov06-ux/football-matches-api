require("dotenv").config();
const path = require("path");
const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const session = require("express-session");
const bcrypt = require("bcrypt");

const itemsRoutes = require("./routes/items");
const requireAuth = require("./middleware/requireAuth");
const requireRole = require("./middleware/requireRole");

const app = express();
app.use(express.json());

// logger
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

const PORT = process.env.PORT || 3000;
const uri = process.env.MONGO_URI || "mongodb://localhost:27017";

const client = new MongoClient(uri);
let db;

// static
const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));

// root
app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// sessions (Assignment 4)
app.set("trust proxy", 1);
app.use(
  session({
    name: "sid",
    secret: process.env.SESSION_SECRET || "change_me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true, // REQUIRED
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 2, // 2h
    },
  })
);

// helper
function validateMatch(body) {
  const { homeTeam, awayTeam, homeScore, awayScore, date } = body;
  if (!homeTeam || !awayTeam || !date) return "Missing required fields";
  if (homeTeam === awayTeam) return "Teams must be different";
  if (!Number.isInteger(homeScore) || homeScore < 0) return "Invalid homeScore";
  if (!Number.isInteger(awayScore) || awayScore < 0) return "Invalid awayScore";
  return null;
}

/* ======================
   AUTH (Assignment 4)
   ====================== */

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "email and password required" });

    const user = await db.collection("users").findOne({ email });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.passwordHash);
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

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("sid");
    res.status(200).json({ message: "Logged out" });
  });
});

app.get("/api/auth/me", (req, res) => {
  if (!req.session.user)
    return res.status(401).json({ message: "Not authenticated" });
  res.status(200).json({ user: req.session.user });
});

/* ======================
   MATCHES (protected)
   ====================== */

app.get("/api/matches", async (req, res) => {
  try {
    const { homeTeam, awayTeam, team, sort, fields } = req.query;

    const filter = {};
    if (homeTeam) filter.homeTeam = homeTeam;
    if (awayTeam) filter.awayTeam = awayTeam;
    if (team) filter.$or = [{ homeTeam: team }, { awayTeam: team }];

    let query = db.collection("matches").find(filter);

    if (sort) {
      const dir = sort.startsWith("-") ? -1 : 1;
      query = query.sort({ [sort.replace("-", "")]: dir });
    }

    if (fields) {
      const proj = {};
      fields.split(",").forEach((f) => (proj[f.trim()] = 1));
      query = query.project(proj);
    }

    res.status(200).json(await query.toArray());
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/matches/:id", async (req, res) => {
  if (!ObjectId.isValid(req.params.id))
    return res.status(400).json({ error: "Invalid id" });

  const match = await db.collection("matches").findOne({
    _id: new ObjectId(req.params.id),
  });

  if (!match) return res.status(404).json({ error: "Match not found" });
  res.status(200).json(match);
});

// organizer only
app.post("/api/matches", requireRole("organizer"), async (req, res) => {
  const error = validateMatch(req.body);
  if (error) return res.status(400).json({ error });

  const result = await db.collection("matches").insertOne(req.body);
  res.status(201).json({ id: result.insertedId });
});

app.put("/api/matches/:id", requireAuth, async (req, res) => {
  if (!ObjectId.isValid(req.params.id))
    return res.status(400).json({ error: "Invalid id" });

  const error = validateMatch(req.body);
  if (error) return res.status(400).json({ error });

  const result = await db.collection("matches").updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: req.body }
  );

  if (!result.matchedCount)
    return res.status(404).json({ error: "Match not found" });

  res.status(200).json({ message: "Match updated" });
});

app.patch("/api/matches/:id", requireAuth, async (req, res) => {
  if (!ObjectId.isValid(req.params.id))
    return res.status(400).json({ error: "Invalid id" });

  const result = await db.collection("matches").updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: req.body }
  );

  if (!result.matchedCount)
    return res.status(404).json({ error: "Match not found" });

  res.status(200).json({ message: "Match updated" });
});

// organizer only
app.delete("/api/matches/:id", requireRole("organizer"), async (req, res) => {
  if (!ObjectId.isValid(req.params.id))
    return res.status(400).json({ error: "Invalid id" });

  const result = await db.collection("matches").deleteOne({
    _id: new ObjectId(req.params.id),
  });

  if (!result.deletedCount)
    return res.status(404).json({ error: "Match not found" });

  res.status(204).end();
});

/* ======================
   META + START
   ====================== */

app.get("/api/version", (req, res) => {
  res.status(200).json({
    name: "football-matches-api",
    version: "1.0.1",
    deployedAt: new Date().toISOString(),
  });
});

async function start() {
  try {
    await client.connect();
    db = client.db("football");
    console.log("Connected to MongoDB");

    // items (from previous tasks)
    const itemsCollection = db.collection("items");
    app.use("/api/items", itemsRoutes(itemsCollection));

    app.use("/api", (req, res) => {
      res.status(404).json({ error: "API route not found" });
    });

    app.listen(PORT, () =>
      console.log(`Server running on port ${PORT}`)
    );
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

start();
