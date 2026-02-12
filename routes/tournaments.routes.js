const express = require("express");
const { ObjectId } = require("mongodb");

const requireAuth = require("../middleware/requireAuth");
const { ensureTournamentOwnerOrAdmin } = require("../middleware/ownership");

const router = express.Router();

// CREATE tournament
router.post("/", requireAuth, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { name } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "Tournament name required" });
    }

    const doc = {
      name: String(name).trim(),
      ownerId: new ObjectId(req.session.user.id),
      teams: [],
      createdAt: new Date(),
      views: 0,
    };

    const result = await db.collection("tournaments").insertOne(doc);
    res.status(201).json({ id: result.insertedId });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// GET all tournaments (admin -> all, user -> own) + pagination
router.get("/", requireAuth, async (req, res) => {
  try {
    const db = req.app.locals.db;

    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "10", 10), 1), 50);
    const skip = (page - 1) * limit;

    const filter =
      req.session.user.role === "admin"
        ? {}
        : { ownerId: new ObjectId(req.session.user.id) };

    const col = db.collection("tournaments");
    const total = await col.countDocuments(filter);

    const items = await col
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    res.status(200).json({
      items,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// GET tournament by id (+ $inc views)
router.get("/:id", requireAuth, async (req, res) => {
  const db = req.app.locals.db;
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid id" });
  }

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
router.put("/:id", requireAuth, ensureTournamentOwnerOrAdmin, async (req, res) => {
  try {
    const db = req.app.locals.db;
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
router.delete("/:id", requireAuth, ensureTournamentOwnerOrAdmin, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const tid = new ObjectId(req.params.id);

    await db.collection("tournaments").deleteOne({ _id: tid });
    await db.collection("matches").deleteMany({ tournamentId: tid });

    res.status(204).end();
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// ADD team to tournament
router.post("/:id/teams", requireAuth, ensureTournamentOwnerOrAdmin, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { name } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "Team name required" });
    }

    const teamDoc = { _id: new ObjectId(), name: String(name).trim() };

    const result = await db.collection("tournaments").updateOne(
      { _id: new ObjectId(req.params.id), "teams.name": { $ne: teamDoc.name } },
      { $addToSet: { teams: teamDoc } }
    );

    if (!result.matchedCount) {
      return res
        .status(409)
        .json({ error: "Team already exists or tournament not found" });
    }

    res.status(201).json({ teamId: teamDoc._id });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// REMOVE team from tournament
router.delete(
  "/:id/teams/:teamId",
  requireAuth,
  ensureTournamentOwnerOrAdmin,
  async (req, res) => {
    if (!ObjectId.isValid(req.params.teamId)) {
      return res.status(400).json({ error: "Invalid team id" });
    }

    try {
      const db = req.app.locals.db;
      const tid = new ObjectId(req.params.id);
      const teamId = new ObjectId(req.params.teamId);

      await db.collection("tournaments").updateOne(
        { _id: tid },
        { $pull: { teams: { _id: teamId } } }
      );

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

// CREATE match for tournament
router.post(
  "/:id/matches",
  requireAuth,
  ensureTournamentOwnerOrAdmin,
  async (req, res) => {
    try {
      const db = req.app.locals.db;
      const { homeTeamId, awayTeamId, homeScore, awayScore, date } = req.body;

      if (!ObjectId.isValid(homeTeamId) || !ObjectId.isValid(awayTeamId)) {
        return res.status(400).json({ error: "Invalid team id" });
      }
      if (String(homeTeamId) === String(awayTeamId)) {
        return res.status(400).json({ error: "Teams must be different" });
      }
      if (!date) return res.status(400).json({ error: "date required" });
      if (!Number.isInteger(homeScore) || homeScore < 0) {
        return res.status(400).json({ error: "Invalid homeScore" });
      }
      if (!Number.isInteger(awayScore) || awayScore < 0) {
        return res.status(400).json({ error: "Invalid awayScore" });
      }

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
        ownerId: new ObjectId(req.session.user.id),
        createdAt: new Date(),
      };

      const result = await db.collection("matches").insertOne(doc);
      res.status(201).json({ id: result.insertedId });
    } catch {
      res.status(500).json({ error: "Server error" });
    }
  }
);

// Aggregation: standings
router.get("/:id/standings", requireAuth, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid tournament id" });
  }

  try {
    const db = req.app.locals.db;
    const tid = new ObjectId(req.params.id);

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
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
