# Football Matches Manager

This is a simple Node.js backend using the native MongoDB driver for managing football matches, with a football-themed HTML/CSS/JS frontend.

## Installation

1. Make sure MongoDB is running locally on port 27017.
2. Run `npm install` to install dependencies.

## Running

Run `npm start` to start the server on port 3000.

Open http://localhost:3000 in your browser to access the frontend.

## API Endpoints

- GET /matches - Get all matches
- POST /matches - Create a new match (send JSON body with homeTeam, awayTeam, homeScore, awayScore, date)
- GET /matches/:id - Get match by ID
- PUT /matches/:id - Update match by ID
- DELETE /matches/:id - Delete match by ID

## Frontend Features

- Add new football matches
- View list of matches with scores and dates
- Edit existing matches
- Delete matches
- Football-themed UI with green background

## Frontend Features

- View list of users
- Add new user
- Edit existing user
- Delete user

## Troubleshooting

- If MongoDB connection fails, ensure MongoDB is started.
- Check console for errors.