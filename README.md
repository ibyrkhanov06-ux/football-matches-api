# Football Matches Manager (Express + MongoDB)

Web app to manage football matches with full CRUD (Create, Read, Update, Delete).
Backend: Express.js + MongoDB Native Driver  
Frontend: HTML/CSS/JS (served from `public/`)

## Live Demo (Deployed)
https://football-matches-api-x14a.onrender.com

---

## Features
- Create a match (home team, away team, score, date)
- View all matches
- Edit a match
- Delete a match
- Server-side **Filtering / Sorting / Projection** via query parameters

---

## Tech Stack
- Node.js + Express
- MongoDB Native Driver
- MongoDB Atlas (cloud database)
- Render (deployment)

---

## Project Structure
```txt
asik_jony/
  public/
    index.html
    script.js
    style.css
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