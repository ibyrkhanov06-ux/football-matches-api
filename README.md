# Football Matches Manager (Express + MongoDB)

Web application for managing football matches with full CRUD functionality and session-based authentication.  
The project was extended as part of **Assignment 4 (Sessions & Security)**.

Backend: Express.js + MongoDB Native Driver  
Frontend: HTML / CSS / JavaScript (served from `public/`)

---

## Live Demo (Deployed)
https://football-matches-api-x14a.onrender.com

---

## Features

### Football Matches Management
- Create football matches (home team, away team, score, date)
- View all matches
- Edit existing matches
- Delete matches
- Server-side **Filtering / Sorting / Projection** using query parameters

### Authentication & Authorization (Assignment 4)
- Session-based authentication using `express-session`
- Login via Web UI (no Postman required)
- Session stored in HttpOnly cookies
- Role-based authorization:
  - `organizer` — can create and delete matches
  - `participant` — can view and update matches
- Unauthorized users cannot modify data

---

## Tech Stack
- Node.js
- Express.js
- MongoDB Native Driver
- MongoDB Atlas (cloud database)
- Render (deployment)
- express-session
- bcrypt

---

## Project Structure
```txt
football-matches-api/
  public/
    index.html
    login.html
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
## How to run 
```
npm install 
npm start 
```
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