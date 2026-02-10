# Football Matches & Tournaments Manager (MongoDB Final Project)

A full-stack web app built with **Node.js + Express + MongoDB (Native Driver)**.  
The project allows users to manage football **matches** and **tournaments**, add **teams**, record **match results**, and generate **standings** using **MongoDB Aggregation Pipeline**.

---

## ✅ Features (What the project does)

### Frontend (4 pages)
- **Home (Matches CRUD)** — `index.html`
  - View matches
  - Filtering / Sorting / Projection
  - Create/Update/Delete (only for organizer)
- **Login** — `login.html`
  - Session login/logout
- **Tournaments** — `tournaments.html`
  - Create tournaments
  - Add/remove teams
  - Add matches inside a tournament
- **Standings** — `standings.html`
  - Shows tournament standings using Aggregation (points, goals, wins, etc.)

### Backend (REST API)
- CRUD for matches and tournaments
- Auth with **sessions**
- Role-based access: **organizer** can create/delete matches and manage tournaments
- Filtering / Sorting / Projection in `GET /api/matches` and `GET /api/tournaments/:id/matches`
- Aggregation pipeline: `GET /api/tournaments/:id/standings`
- Indexes for performance

---

## 🧰 Tech Stack
- Node.js
- Express
- MongoDB Native Driver
- express-session (sessions)
- bcrypt (password hashing)
- HTML/CSS/JavaScript (Fetch API)

---

## 📁 Project Structure

```txt
football-matches-api/
  public/
    index.html
    login.html
    tournaments.html
    standings.html
    script.js
    style.css
  middleware/
    requireAuth.js
    requireRole.js
  routes/
    items.js
  scripts/
    seedUser.js
  server.js
  package.json
  README.md
```

---

## 🗃️ Database Design (Data Modeling)

### Collections
- **users**
  - stores login accounts (email, passwordHash, role)
- **matches**
  - stores standalone matches
- **tournaments**
  - stores tournaments and embedded teams
- **items** (from practice tasks)

### Embedded + Referenced documents
✅ **Embedded**
- `tournaments.teams[]` is embedded inside a tournament:
  - fast access to all teams in a tournament

✅ **Referenced**
- `tournament_matches` (or tournament matches inside API) reference teams by ObjectId:
  - `homeTeamId`, `awayTeamId` are stored as ObjectId references

This avoids duplication and supports flexible queries and aggregation.

---

## 🔐 Authentication & Roles

### Roles
- **organizer** (admin role)
  - can create/delete matches
  - can create tournaments, add teams and matches
- normal user
  - can view data (read-only)

### Session Auth
- login creates a session cookie (`sid`)
- `/api/auth/me` returns current authenticated user

---

## ▶️ Run Locally (Step-by-step)

### 1) Install dependencies
```bash
npm install
```
---

### 2) Create .env file in project root

Create a file named .env:

PORT=3000
MONGO_URI=mongodb://localhost:27017
SESSION_SECRET=very_long_random_string_123456
NODE_ENV=development


For Atlas use a connection string like:
mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
---

### 3) Start MongoDB (local)

Make sure MongoDB is running:

MongoDB Compass connection: mongodb://localhost:27017

### 4) Seed an organizer user (optional but recommended)

Run:

node scripts/seedUser.js


This creates a default organizer user (check script for credentials).

### 5) Start the server
```bash
npm start
```
Server will run at:

http://localhost:3000
---

# API Endpoints (with examples)
## Auth

POST /api/auth/login

{ "email": "admin@mail.com", "password": "123456" }


POST /api/auth/logout

GET /api/auth/me

## Matches (CRUD + Filtering/Sorting/Projection)

GET /api/matches

### Filtering:

/api/matches?team=Barcelona

/api/matches?homeTeam=Real%20Madrid

### Sorting:

/api/matches?sort=date

/api/matches?sort=-date

### Projection:

/api/matches?fields=homeTeam,awayTeam,date

POST /api/matches (organizer only)

{
  "homeTeam": "Real Madrid",
  "awayTeam": "Barcelona",
  "homeScore": 2,
  "awayScore": 1,
  "date": "2026-02-01"
}


PUT /api/matches/:id (requires auth)

PATCH /api/matches/:id (requires auth)

DELETE /api/matches/:id (organizer only)

## Tournaments

GET /api/tournaments

POST /api/tournaments

{ "name": "Champions League" }


GET /api/tournaments/:id

## Teams (embedded)

POST /api/tournaments/:id/teams

{ "name": "Real Madrid" }


DELETE /api/tournaments/:id/teams/:teamId
Uses $pull to remove embedded team.

## Tournament Matches

POST /api/tournaments/:id/matches

{
  "homeTeamId": "TEAM_OBJECT_ID",
  "awayTeamId": "TEAM_OBJECT_ID",
  "homeScore": 3,
  "awayScore": 2,
  "date": "2026-02-02"
}

--- 
Aggregation (Standings)
Endpoint

GET /api/tournaments/:id/standings

Output (example)

Returns standings with:

games, wins, draws, losses

goalsFor, goalsAgainst, goalDiff

points

This is implemented using a multi-stage Aggregation Pipeline with business meaning:

compute results for each team

accumulate stats

sort by points / goal difference
---

 Indexes & Optimization

To improve performance for filtering + sorting, the project uses indexes.

Recommended indexes (created in DB / Compass):

On matches:

{ date: -1 } for sorting by date

{ homeTeam: 1, awayTeam: 1 } for filtering

On tournaments:

{ name: 1 } for fast lookup by name

These indexes reduce collection scans and improve query performance.
---
Advanced MongoDB Operations (Update/Delete)

Used operators:

$set — update match fields

$push — add embedded teams/matches

$pull — remove embedded teams

$inc — (can be used for incrementing stats or counters)

validation checks (400 errors for incorrect fields)
--- 
## HTTP Status Codes Used
200 OK — successful GET/PUT/DELETE

201 Created — successful POST

400 Bad Request — invalid input / invalid id

404 Not Found — match not found / wrong API route

500 Internal Server Error — server/database error
## DEployment notes 
200 OK — successful GET/PUT/DELETE

201 Created — successful POST

400 Bad Request — invalid input / invalid id

404 Not Found — match not found / wrong API route

500 Internal Server Error — server/database error