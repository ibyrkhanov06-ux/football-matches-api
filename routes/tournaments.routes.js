const express = require("express");
const { ObjectId } = require("mongodb");

const requireAuth = require("../middleware/requireAuth");
const { ensureTournamentOwnerOrAdmin } = require("../middleware/ownership");

const router = express.Router();
console.log("TOURNAMENT ROUTES LOADED ✅");

/**
 * Some old records may have _id stored as STRING (not ObjectId).
 * These helpers let us match both variants to avoid "Tournament not found".
 */
function oidOrString(val) {
  if (ObjectId.isValid(val)) return [new ObjectId(val), val];
  return [val];
}

function idFilter(id) {
  const ids = oidOrString(id);
  return ids.length === 2
    ? { $or: [{ _id: ids[0] }, { _id: ids[1] }] }
    : { _id: ids[0] };
}

function ownerIdFilter(userId) {
  const ids = oidOrString(userId);
  return ids.length === 2
    ? { $or: [{ ownerId: ids[0] }, { ownerId: ids[1] }] }
    : { ownerId: ids[0] };
}

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
      // store as string (stable with sessions and avoids mismatch)
      ownerId: req.session.user.id,
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
      req.session.user.role === "admin" ? {} : ownerIdFilter(req.session.user.id);

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

/**
 * IMPORTANT: keep more specific route BEFORE "/:id"
 * otherwise "/:id" can swallow "/:id/standings"
 */

// Aggregation: standings
router.get("/:id/standings", requireAuth, async (req, res) => {
  try {
    const db = req.app.locals.db;

    const tournament = await db.collection("tournaments").findOne(idFilter(req.params.id));
    if (!tournament) return res.status(404).json({ error: "Tournament not found" });

    const tid = tournament._id;

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

// GET tournament by id (+ inc views)
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const db = req.app.locals.db;

    const t = await db.collection("tournaments").findOneAndUpdate(
      idFilter(req.params.id),
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
      idFilter(req.params.id),
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

    const tournament = await db.collection("tournaments").findOne(idFilter(req.params.id));
    if (!tournament) return res.status(404).json({ error: "Tournament not found" });

    await db.collection("tournaments").deleteOne({ _id: tournament._id });
    await db.collection("matches").deleteMany({ tournamentId: tournament._id });

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
      { ...idFilter(req.params.id), "teams.name": { $ne: teamDoc.name } },
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

// REMOVE team from tournament
router.delete("/:id/teams/:teamId", requireAuth, ensureTournamentOwnerOrAdmin, async (req, res) => {
  if (!ObjectId.isValid(req.params.teamId)) {
    return res.status(400).json({ error: "Invalid team id" });
  }

  try {
    const db = req.app.locals.db;
    const teamId = new ObjectId(req.params.teamId);

    const tournament = await db.collection("tournaments").findOne(idFilter(req.params.id));
    if (!tournament) return res.status(404).json({ error: "Tournament not found" });

    await db.collection("tournaments").updateOne(
      { _id: tournament._id },
      { $pull: { teams: { _id: teamId } } }
    );

    await db.collection("matches").deleteMany({
      tournamentId: tournament._id,
      $or: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
    });

    res.status(204).end();
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// CREATE match for tournament
router.post("/:id/matches", requireAuth, ensureTournamentOwnerOrAdmin, async (req, res) => {
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

    const tournament = await db.collection("tournaments").findOne(idFilter(req.params.id));
    if (!tournament) return res.status(404).json({ error: "Tournament not found" });

    const doc = {
      tournamentId: tournament._id,     // ✅ correct type (string/ObjectId)
      homeTeamId: new ObjectId(homeTeamId),
      awayTeamId: new ObjectId(awayTeamId),
      homeScore,
      awayScore,
      date,
      ownerId: req.session.user.id,     // string
      createdAt: new Date(),
    };

    const result = await db.collection("matches").insertOne(doc);
    res.status(201).json({ id: result.insertedId });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;