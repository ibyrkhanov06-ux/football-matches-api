require('dotenv').config();
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
app.use(express.json());

// logger middleware (method + url)
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// static files
app.use(express.static('public'));
const PORT = process.env.PORT || 3000;
const uri = process.env.MONGO_URI || 'mongodb://localhost:27017';
const client = new MongoClient(uri);
let db;

// helper: validate match
function validateMatch(body) {
  const { homeTeam, awayTeam, homeScore, awayScore, date } = body;

  if (!homeTeam || !awayTeam || !date) return 'Missing required fields';
  if (homeTeam === awayTeam) return 'Teams must be different';

  // ВАЖНО: если parseInt вернул NaN, Number.isInteger вернет false → будет 400 (это ок)
  if (!Number.isInteger(homeScore) || homeScore < 0) return 'Invalid homeScore';
  if (!Number.isInteger(awayScore) || awayScore < 0) return 'Invalid awayScore';

  return null;
}

// GET all matches (filtering / sorting / projection)
app.get('/api/matches', async (req, res) => {
  try {
    const { homeTeam, awayTeam, team, sort, fields } = req.query;

    const filter = {};
    if (homeTeam) filter.homeTeam = homeTeam;
    if (awayTeam) filter.awayTeam = awayTeam;
    if (team) filter.$or = [{ homeTeam: team }, { awayTeam: team }];

    let query = db.collection('matches').find(filter);

    // sorting
    if (sort) {
      const direction = sort.startsWith('-') ? -1 : 1;
      const field = sort.replace('-', '');
      query = query.sort({ [field]: direction });
    }

    // projection
    if (fields) {
      const projection = {};
      fields.split(',').forEach(f => (projection[f.trim()] = 1));
      query = query.project(projection);
    }

    const matches = await query.toArray();
    res.status(200).json(matches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET match by id
app.get('/api/matches/:id', async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  try {
    const match = await db.collection('matches').findOne({
      _id: new ObjectId(req.params.id),
    });

    if (!match) return res.status(404).json({ error: 'Match not found' });

    res.status(200).json(match);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create match
app.post('/api/matches', async (req, res) => {
  const error = validateMatch(req.body);
  if (error) return res.status(400).json({ error });

  try {
    const result = await db.collection('matches').insertOne(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update match
app.put('/api/matches/:id', async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  const error = validateMatch(req.body);
  if (error) return res.status(400).json({ error });

  try {
    const result = await db.collection('matches').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: req.body }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Match not found' });
    }

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE match
app.delete('/api/matches/:id', async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  try {
    const result = await db.collection('matches').deleteOne({
      _id: new ObjectId(req.params.id),
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Match not found' });
    }

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// global 404 for API
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

// ✅ Start server ONLY after DB connects
async function start() {
  try {
    await client.connect();
    db = client.db('football');
    console.log('Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
