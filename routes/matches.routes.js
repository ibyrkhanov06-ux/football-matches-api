const express = require("express");
const { ObjectId } = require("mongodb");

const requireAuth = require("../middleware/requireAuth");
const { ensureMatchOwnerOrAdmin } = require("../middleware/ownership");

const router = express.Router();

function validateMatch(body) {
  const { homeTeam, awayTeam, homeScore, awayScore, date } = body;
  if (!homeTeam || !awayTeam || !date) return "Missing required fields";
  if (homeTeam === awayTeam) return "Teams must be different";
  if (!Number.isInteger(homeScore) || homeScore < 0) return "Invalid homeScore";
  if (!Number.isInteger(awayScore) || awayScore < 0) return "Invalid awayScore";
  return null;
}

// GET /api/matches (filters + pagination)
router.get("/", async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { homeTeam, awayTeam, team, sort, fields } = req.query;

    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "10", 10), 1), 50);
    const skip = (page - 1) * limit;

    const filter = {};
    if (homeTeam) filter.homeTeam = homeTeam;
    if (awayTeam) filter.awayTeam = awayTeam;
    if (team) filter.$or = [{ homeTeam: team }, { awayTeam: team }];

    let query = db.collection("matches").find(filter);

    if (sort) {
      const dir = String(sort).startsWith("-") ? -1 : 1;
      query = query.sort({ [String(sort).replace("-", "")]: dir });
    }

    if (fields) {
      const proj = {};
      String(fields)
        .split(",")
        .forEach((f) => (proj[f.trim()] = 1));
      query = query.project(proj);
    }

    const total = await db.collection("matches").countDocuments(filter);
    const items = await query.skip(skip).limit(limit).toArray();

    res.status(200).json({ items, page, limit, total, pages: Math.ceil(total / limit) });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/matches/:id
router.get("/:id", async (req, res) => {
  const db = req.app.locals.db;
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid id" });
  }

  const match = await db.collection("matches").findOne({
    _id: new ObjectId(req.params.id),
  });

  if (!match) return res.status(404).json({ error: "Match not found" });
  res.status(200).json(match);
});

// POST /api/matches (owner creates)
router.post("/", requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  const error = validateMatch(req.body);
  if (error) return res.status(400).json({ error });

  const doc = {
    ...req.body,
    ownerId: new ObjectId(req.session.user.id),
    createdAt: new Date(),
  };

  const result = await db.collection("matches").insertOne(doc);
  res.status(201).json({ id: result.insertedId });
});

// PUT /api/matches/:id (owner/admin)
router.put("/:id", requireAuth, ensureMatchOwnerOrAdmin, async (req, res) => {
  const db = req.app.locals.db;
  const error = validateMatch(req.body);
  if (error) return res.status(400).json({ error });

  await db.collection("matches").updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: req.body }
  );

  res.status(200).json({ message: "Match updated" });
});

// PATCH /api/matches/:id (owner/admin)
router.patch("/:id", requireAuth, ensureMatchOwnerOrAdmin, async (req, res) => {
  const db = req.app.locals.db;

  await db.collection("matches").updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: req.body }
  );

  res.status(200).json({ message: "Match updated" });
});

// DELETE /api/matches/:id (owner/admin)
router.delete("/:id", requireAuth, ensureMatchOwnerOrAdmin, async (req, res) => {
  const db = req.app.locals.db;

  const result = await db.collection("matches").deleteOne({
    _id: new ObjectId(req.params.id),
  });

  if (!result.deletedCount) return res.status(404).json({ error: "Match not found" });
  res.status(204).end();
});

module.exports = router;
