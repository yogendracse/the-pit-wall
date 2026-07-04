# 🏁 The Pit Wall: F1 Live Strategy & ERS Analysis App

**The Pit Wall** is a self-hosted, local-first web application designed for personal use during Formula 1 sessions. It pulls near-live and historical data from the free OpenF1 API to help you simulate race strategies (undercut/overcut, safety car windows) and visualize driver telemetry (estimated ERS energy deployment vs. harvesting).

---

## 🌟 Key Features

### 1. Live Timing Board
- Monitors live or historical session standings.
- Displays running order, gaps to the leader, intervals, last/best lap times, sector times, current tire compound, stint age, and pit stop counts.
- Updates automatically on a configurable server-side polling interval (~15s) to comply with API limits.

### 2. Strategy Simulator
- **Interactive Degradation Model**: Estimate tire degradation slopes dynamically per compound.
- **Interactive Pit Sim**: Calculate stayed-out vs. pitted-now pace deltas over the remaining laps.
- **Undercut/Overcut Analysis**: Select a rival driver to see if/when a pit stop now will beat staying out.
- **Safety Car Alerts**: Automatically triggers a "cheap pit stop" warning when an active Safety Car (SC) or Virtual Safety Car (VSC) is detected, adjusting the circuit's pit-loss duration.
- **Zero Extra API Calls**: Adjust sliders for Pit Loss, Tire Deg Rate, and Laps Remaining for instant client-side updates.

### 3. ERS Deployment Estimator (Proxy Model)
- **Heuristic Telemetry Classification**: Since official energy store (ES) battery status is private, the app processes raw `/car_data` channels (throttle, brake, speed, RPM, gear, DRS) to classify zones into:
  - **Deploy**: Full throttle + accelerating on straightaways.
  - **Harvest**: Active braking or lift-and-coast zones.
  - **Neutral**: Standard cruising.
- **Comparative Visualizer**: Select any two drivers on a specific lap to compare their speed/throttle telemetry side-by-side.
- *Includes a persistent disclaimer explaining the ERS estimate is a heuristic proxy model.*

### 4. Weather Panel
- Renders track/air temp, humidity, pressure, rainfall status, wind speed, and direction.
- Monitors track temp trends to help fine-tune the Strategy Sim's tire degradation sliders.

---

## 🛠️ Tech Stack

- **Backend**: Node.js + Express (ES Modules)
- **Frontend**: React + Vite + Tailwind CSS v4 + Recharts
- **Data Source**: OpenF1 API (Free/Historical Tier)

---

## 🚀 Setup & Run Locally

Prerequisites: Ensure you have **Node.js** (v18+) installed.

### 1. Clone the repository
```bash
git clone https://github.com/yogendracse/the-pit-wall.git
cd the-pit-wall
```

### 2. Install Dependencies
Install dependencies for both client and server:
```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

### 3. Run the Servers
Start both servers locally:

**Backend Server (Runs on port 3001)**:
```bash
cd server
npm run dev
```

**Frontend Dev Server (Runs on port 5174)**:
```bash
cd client
npm run dev
```

Open [http://localhost:5174](http://localhost:5174) in your browser.

---

## 🏎️ Running Mock / Historical Runs

By default, the application auto-loads the latest active or completed session. However, you can mock specific historical sessions using the URL query parameter `?session_key=KEY`.

### Spielberg (Austrian GP) Mock Session Keys:
- **2024 Austrian GP Race**: [http://localhost:5174/?session_key=9534](http://localhost:5174/?session_key=9534)
- **2024 Austrian GP Sprint**: [http://localhost:5174/?session_key=9529](http://localhost:5174/?session_key=9529)
- **2023 Austrian GP Race**: [http://localhost:5174/?session_key=9118](http://localhost:5174/?session_key=9118)
- **2023 Austrian GP Sprint**: [http://localhost:5174/?session_key=9117](http://localhost:5174/?session_key=9117)

---

## 🔒 License
This project is open-source and free for personal, educational, and non-commercial F1 analysis.
