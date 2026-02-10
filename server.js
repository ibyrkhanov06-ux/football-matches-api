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

// ===== Auth ass4 =====

// ✅ ADD: REGISTER (Final needs full auth)
app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "email and password required" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    if (!normalizedEmail.includes("@") || String(password).length < 6) {
      return res
        .status(400)
        .json({ message: "Invalid email or password too short (min 6)" });
    }

    const users = db.collection("users");
    const existing = await users.findOne({ email: normalizedEmail });
    if (existing) return res.status(409).json({ message: "Email already exists" });

    // allow only specific roles (optional)
    const safeRole = role === "organizer" ? "organizer" : "user";

    const passwordHash = await bcrypt.hash(password, 10);
    const doc = {
      email: normalizedEmail,
      passwordHash,
      role: safeRole,
      createdAt: new Date(),
    };

    const result = await users.insertOne(doc);

    // auto login after register
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

// helper: ownership check for tournaments
async function ensureTournamentOwner(req, res, next) {
  try {
    const tid = req.params.id;
    if (!ObjectId.isValid(tid)) {
      return res.status(400).json({ error: "Invalid tournament id" });
    }

    const t = await db.collection("tournaments").findOne({
      _id: new ObjectId(tid),
    });

    if (!t) return res.status(404).json({ error: "Tournament not found" });

    // only owner or organizer can modify
    const isOwner = req.session?.user?.id === String(t.ownerId);
    const isOrganizer = req.session?.user?.role === "organizer";
    if (!isOwner && !isOrganizer) {
      return res.status(403).json({ error: "Forbidden" });
    }

    req.tournament = t;
    next();
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
}

// ===== Final: Tournaments (multiple collections + embedded teams) =====

// CREATE tournament
app.post("/api/tournaments", requireAuth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "Tournament name required" });
    }

    const doc = {
      name: String(name).trim(),
      ownerId: new ObjectId(req.session.user.id), // referenced user
      teams: [], // embedded
      createdAt: new Date(),
      views: 0,
    };

    const result = await db.collection("tournaments").insertOne(doc);
    res.status(201).json({ id: result.insertedId });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

// GET all tournaments (mine if not organizer)
app.get("/api/tournaments", requireAuth, async (req, res) => {
  try {
    const filter =
      req.session.user.role === "organizer"
        ? {}
        : { ownerId: new ObjectId(req.session.user.id) };

    const tournaments = await db
      .collection("tournaments")
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json(tournaments);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// GET tournament by id (+ $inc views)
app.get("/api/tournaments/:id", requireAuth, async (req, res) => {
  if (!ObjectId.isValid(req.params.id))
    return res.status(400).json({ error: "Invalid id" });

  try {
    const t = await db.collection("tournaments").findOneAndUpdate(
      { _id: new ObjectId(req.params.id) },
      { $inc: { views: 1 } },
      { returnDocument: "after" }
    );

    if (!t.value) return res.status(404).json({ error: "Tournament not found" });
    res.status(200).json(t.value);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// UPDATE tournament (name)
app.put("/api/tournaments/:id", requireAuth, ensureTournamentOwner, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "Tournament name required" });
    }

    await db.collection("tournaments").updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { name: String(name).trim() } }
    );

    res.status(200).json({ message: "Tournament updated" });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE tournament (+ delete its matches)
app.delete("/api/tournaments/:id", requireAuth, ensureTournamentOwner, async (req, res) => {
  try {
    const tid = new ObjectId(req.params.id);

    await db.collection("tournaments").deleteOne({ _id: tid });
    await db.collection("matches").deleteMany({ tournamentId: tid });

    res.status(204).end();
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// ADD team to tournament (advanced update: $addToSet + embedded _id)
app.post("/api/tournaments/:id/teams", requireAuth, ensureTournamentOwner, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "Team name required" });
    }

    const teamDoc = { _id: new ObjectId(), name: String(name).trim() };

    // prevent duplicates by team name
    const result = await db.collection("tournaments").updateOne(
      { _id: new ObjectId(req.params.id), "teams.name": { $ne: teamDoc.name } },
      { $addToSet: { teams: teamDoc } }
    );

    if (!result.matchedCount) {
      return res.status(409).json({ error: "Team already exists or tournament not found" });
    }

    res.status(201).json({ teamId: teamDoc._id });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// REMOVE team from tournament (advanced update: $pull)
app.delete(
  "/api/tournaments/:id/teams/:teamId",
  requireAuth,
  ensureTournamentOwner,
  async (req, res) => {
    if (!ObjectId.isValid(req.params.teamId))
      return res.status(400).json({ error: "Invalid team id" });

    try {
      const tid = new ObjectId(req.params.id);
      const teamId = new ObjectId(req.params.teamId);

      await db.collection("tournaments").updateOne(
        { _id: tid },
        { $pull: { teams: { _id: teamId } } }
      );

      // also delete matches in this tournament that use that team
      await db.collection("matches").deleteMany({
        tournamentId: tid,
        $or: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
      });

      res.status(204).end();
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  }
);

// CREATE match for tournament (referenced model)
app.post(
  "/api/tournaments/:id/matches",
  requireAuth,
  ensureTournamentOwner,
  async (req, res) => {
    try {
      const { homeTeamId, awayTeamId, homeScore, awayScore, date } = req.body;

      if (!ObjectId.isValid(homeTeamId) || !ObjectId.isValid(awayTeamId)) {
        return res.status(400).json({ error: "Invalid team id" });
      }
      if (String(homeTeamId) === String(awayTeamId)) {
        return res.status(400).json({ error: "Teams must be different" });
      }
      if (!date) return res.status(400).json({ error: "date required" });
      if (!Number.isInteger(homeScore) || homeScore < 0)
        return res.status(400).json({ error: "Invalid homeScore" });
      if (!Number.isInteger(awayScore) || awayScore < 0)
        return res.status(400).json({ error: "Invalid awayScore" });

      const tid = new ObjectId(req.params.id);
      const ht = new ObjectId(homeTeamId);
      const at = new ObjectId(awayTeamId);

      const doc = {
        tournamentId: tid,
        homeTeamId: ht,
        awayTeamId: at,
        homeScore,
        awayScore,
        date,
        createdBy: new ObjectId(req.session.user.id),
        createdAt: new Date(),
      };

      const result = await db.collection("matches").insertOne(doc);
      res.status(201).json({ id: result.insertedId });
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  }
);

// Aggregation: standings table for tournament
app.get(
  "/api/tournaments/:id/standings",
  requireAuth,
  async (req, res) => {
    if (!ObjectId.isValid(req.params.id))
      return res.status(400).json({ error: "Invalid tournament id" });

    try {
      const tid = new ObjectId(req.params.id);

      // get tournament teams (for names)
      const tournament = await db.collection("tournaments").findOne({ _id: tid });
      if (!tournament) return res.status(404).json({ error: "Tournament not found" });

      const pipeline = [
        { $match: { tournamentId: tid } },
        {
          $project: {
            homeTeamId: 1,
            awayTeamId: 1,
            homeScore: 1,
            awayScore: 1,
          },
        },
        {
          $facet: {
            home: [
              {
                $project: {
                  teamId: "$homeTeamId",
                  gf: "$homeScore",
                  ga: "$awayScore",
                  win: { $cond: [{ $gt: ["$homeScore", "$awayScore"] }, 1, 0] },
                  draw: { $cond: [{ $eq: ["$homeScore", "$awayScore"] }, 1, 0] },
                  loss: { $cond: [{ $lt: ["$homeScore", "$awayScore"] }, 1, 0] },
                },
              },
            ],
            away: [
              {
                $project: {
                  teamId: "$awayTeamId",
                  gf: "$awayScore",
                  ga: "$homeScore",
                  win: { $cond: [{ $gt: ["$awayScore", "$homeScore"] }, 1, 0] },
                  draw: { $cond: [{ $eq: ["$awayScore", "$homeScore"] }, 1, 0] },
                  loss: { $cond: [{ $lt: ["$awayScore", "$homeScore"] }, 1, 0] },
                },
              },
            ],
          },
        },
        { $project: { rows: { $concatArrays: ["$home", "$away"] } } },
        { $unwind: "$rows" },
        {
          $group: {
            _id: "$rows.teamId",
            games: { $sum: 1 },
            wins: { $sum: "$rows.win" },
            draws: { $sum: "$rows.draw" },
            losses: { $sum: "$rows.loss" },
            goalsFor: { $sum: "$rows.gf" },
            goalsAgainst: { $sum: "$rows.ga" },
          },
        },
        {
          $addFields: {
            points: { $add: [{ $multiply: ["$wins", 3] }, "$draws"] },
            goalDiff: { $subtract: ["$goalsFor", "$goalsAgainst"] },
          },
        },
        { $sort: { points: -1, goalDiff: -1, goalsFor: -1 } },
      ];

      const stats = await db.collection("matches").aggregate(pipeline).toArray();

      // map teamId -> name from embedded teams
      const nameMap = {};
      (tournament.teams || []).forEach((t) => {
        nameMap[String(t._id)] = t.name;
      });

      const result = stats.map((s) => ({
        teamId: s._id,
        teamName: nameMap[String(s._id)] || "Unknown team",
        games: s.games,
        wins: s.wins,
        draws: s.draws,
        losses: s.losses,
        goalsFor: s.goalsFor,
        goalsAgainst: s.goalsAgainst,
        goalDiff: s.goalDiff,
        points: s.points,
      }));

      res.status(200).json({ tournamentId: tid, standings: result });
    } catch (e) {
      res.status(500).json({ error: "Server error" });
    }
  }
);

// ===== Matches (your existing) =====

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

// ===== Meta and start =====

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

    // ✅ Indexes (Final requirement)
    await db.collection("users").createIndex({ email: 1 }, { unique: true });
    await db.collection("matches").createIndex({ tournamentId: 1, date: -1 });
    await db.collection("tournaments").createIndex({ ownerId: 1, createdAt: -1 });

    // items (from previous tasks)
    const itemsCollection = db.collection("items");
    app.use("/api/items", itemsRoutes(itemsCollection));

    app.use("/api", (req, res) => {
      res.status(404).json({ error: "API route not found" });
    });

    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

start();
