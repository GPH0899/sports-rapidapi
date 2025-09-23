
# NFL Stoppage Detector & Live Game Dashboard

This project is a modern Node.js/Express web app that displays live and upcoming NFL games, lets users check game status, and detects stoppages using RapidAPI and ESPN data sources. The UI is built with EJS and features a professional, responsive design.

## Features
- View live and upcoming NFL games
- Pick games by date or season/week (calendar)
- See game status, last play, and stoppage detection
- Modern, responsive UI
- Powered by RapidAPI and ESPN APIs

## Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- npm
- RapidAPI key for nfl-api-data

### Installation
1. Clone the repository:
	```bash
	git clone https://github.com/GPH0899/sports-rapidapi.git
	cd sports-rapidapi
	```
2. Install dependencies:
	```bash
	npm install
	```
3. Create a `.env` file with your RapidAPI credentials:
	```env
	RAPID_API_KEY=your_rapidapi_key_here
	RAPID_API_HOST=nfl-api-data.p.rapidapi.com
	PORT=3001
	```

### Running the App
```bash
node server.js
```
Visit [http://localhost:3001](http://localhost:3001) in your browser.

## Usage
- Use the date picker or calendar dropdown to select a week or date
- Click "Load Games" to view available games
- Select a game and click "Check Game Status" to see live status and stoppage info

## Project Structure
- `server.js` — Express server and API logic
- `views/index.ejs` — Main UI template
- `public/` — Static assets (if any)
- `.env` — Environment variables (not committed)

## Author
GPH0899
