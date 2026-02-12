const { ObjectId } = require("mongodb");

async function ensureTournamentOwnerOrAdmin(req, res, next) {
  try {
    const db = req.app.locals.db;
    const tid = req.params.id;

    if (!ObjectId.isValid(tid)) {
      return res.status(400).json({ error: "Invalid tournament id" });
    }

    const t = await db.collection("tournaments").findOne({ _id: new ObjectId(tid) });
    if (!t) return res.status(404).json({ error: "Tournament not found" });

    const user = req.session?.user;
    const isOwner = user && String(t.ownerId) === user.id;
    const isAdmin = user && user.role === "admin";
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: "Forbidden" });
    }

    req.tournament = t;
    next();
  } catch {
    res.status(500).json({ error: "Server error" });
  }
}

async function ensureMatchOwnerOrAdmin(req, res, next) {
  try {
    const db = req.app.locals.db;
    const mid = req.params.id;

    if (!ObjectId.isValid(mid)) {
      return res.status(400).json({ error: "Invalid match id" });
    }

    const match = await db.collection("matches").findOne({ _id: new ObjectId(mid) });
    if (!match) return res.status(404).json({ error: "Match not found" });

    const user = req.session?.user;
    const isOwner = user && String(match.ownerId) === user.id;
    const isAdmin = user && user.role === "admin";
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: "Forbidden" });
    }

    req.match = match;
    next();
  } catch {
    res.status(500).json({ error: "Server error" });
  }
}

module.exports = {
  ensureTournamentOwnerOrAdmin,
  ensureMatchOwnerOrAdmin,
};
