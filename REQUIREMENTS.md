# F1 Live Strategy & ERS Analysis App — Requirements

## 1. Purpose
A self-hosted web app for personal use during F1 sessions (practice, quali, race) that:
1. Pulls near-live/historical F1 data for free.
2. Lets me run pit-stop / tire strategy simulations during a race (undercut, overcut, safety car scenarios).
3. Visualizes how each driver appears to be deploying vs. harvesting energy (ERS), using a clearly-labeled proxy model built from public telemetry — since real battery state-of-charge is never published by F1/teams.

## 2. Hard Constraints
- **Zero ongoing cost.** No paid APIs, no paid hosting tier, no paid data subscriptions. Use OpenF1's free tier only.
  - Free tier = historical data, unauthenticated, no rate-limit-killing usage. OpenF1 classifies data as "live" (paid) from 30 min before a session to 30 min after; outside that window it's free. Practical implication: this app will run in a **near-live poll-and-catch-up mode** — poll frequently during a session and accept that some records may lag until they roll into the free/historical bucket. Design must not assume a paid websocket/MQTT feed.
  - Respect free tier limits: 3 req/s, 30 req/min. All polling must be rate-limited and cached server-side; never fan out per-client requests to OpenF1.
- **No real ERS/battery telemetry exists publicly.** Do not claim exact battery SoC, MGU-K/MGU-H deployment wattage, or harvest numbers. Everything ERS-related is a derived estimate from throttle %, speed, RPM, gear, brake, and DRS channels (OpenF1 `car_data` endpoint). Label all ERS output in the UI as "estimated / inferred" with a visible disclaimer, not as official data.
- **Local-first deployable.** Should run with `npm install && npm run dev` locally, and be deployable later to a free-tier host (e.g. Render/Fly/Vercel free tier) without code changes — no assumption of paid infra.

## 3. Tech Stack
- **Backend:** Node.js + Express (or Fastify), plain JS or TS.
- **Frontend:** React + Vite, Recharts for charts, no paid UI kit.
- **Data source:** OpenF1 REST API (`https://api.openf1.org/v1/...`), free/historical tier only.
- **No database required initially** — in-memory caching with TTL is sufficient (sessions are short-lived and free tier data doesn't need long-term storage yet). Leave a clean seam to add SQLite later if I want historical season storage.

## 4. Data Source Details (OpenF1 free endpoints to use)
- `/sessions`, `/meetings` — discover current/upcoming/past sessions, get `session_key`.
- `/drivers` — driver number → name/team mapping for a session.
- `/laps` — lap times, sector times per driver.
- `/stints` — tire compound and stint length per driver.
- `/pit` — pit stop timing/duration.
- `/intervals` — gap to leader / interval to car ahead.
- `/position` — running order over time.
- `/car_data` — throttle, brake, RPM, speed, gear, DRS at ~3.7Hz. **This is the sole input to the ERS proxy model.**
- `/weather` — track/air temp, humidity, rainfall (affects tire deg model).
- `/race_control` — flags, safety car, VSC events (must factor into strategy sim).

All calls server-side only, cached, and rate-limited to stay within free-tier limits.

## 5. Functional Requirements

### 5.1 Session & Live Data
- Ability to pick a meeting/session (past or current) from `/meetings` + `/sessions`.
- Poll `/laps`, `/position`, `/intervals`, `/pit`, `/stints`, `/race_control`, `/weather` on a server-side interval (configurable, default ~10–20s) while a session is selected as "active."
- Serve cached, normalized data to the frontend via REST (polling from client is fine at low frequency; no need for websockets initially).
- Timing board UI: current order, gap to leader/car ahead, current tire compound + stint age per driver, last/best lap, pit stop count.

### 5.2 Strategy Simulator
- Tire degradation model: simple per-compound lap-time-delta-per-lap curve (configurable base params, refined later using actual `/laps` + `/stints` data from the session to fit a rough degradation slope per compound).
- Pit-stop simulator: given current lap, tire age, gap to cars ahead/behind, and a pit-loss constant for the circuit, compute:
  - Projected lap time delta for staying out vs. pitting now vs. pitting in N laps.
  - Undercut/overcut outcome estimate against a specific rival (input: rival driver number) — will the pit now beat staying out by X seconds after Y laps.
- Safety car / VSC awareness: if `/race_control` shows an active SC/VSC, surface a "cheap pit stop window" alert (pit loss is much lower under SC).
- Must be interactive: I can tweak assumed pit-loss, tire deg rate, and laps remaining and re-run instantly (client-side recompute using cached session data, not a new API call).

### 5.3 ERS Deployment Estimator (proxy model)
- Input: `/car_data` for a driver over a lap (throttle %, speed, RPM, gear, brake, DRS, distance/time).
- Output: a per-lap "deploy vs. harvest vs. neutral" zone classification along the lap distance, using heuristics such as:
  - Full throttle + rising speed on a straight after a slow corner exit → likely deployment.
  - Lift-and-coast / partial throttle before a braking zone → likely harvesting/lift.
  - Braking zones → harvesting (regen) assumption.
- Visualize as a lap trace (speed or throttle vs. distance) with colored bands for estimated deploy/harvest/neutral zones, selectable per driver, comparable side-by-side for 2 drivers on the same lap.
- Persistent, clearly visible disclaimer: "Estimated from public telemetry (throttle/speed/RPM/DRS). Not actual battery data — F1 does not publish ERS deployment or state-of-charge."

### 5.4 General
- Driver/team selector reused across all views.
- Graceful handling of no-session / off-season state (show most recent completed session by default).
- Error handling for OpenF1 downtime/rate-limit responses — cache last-good data and show a "stale data" indicator rather than crashing.

## 6. Non-Functional Requirements
- All OpenF1 calls rate-limited and cached server-side (respect 3 req/s / 30 req/min free tier).
- No API keys or secrets required for v1 (free tier is unauthenticated).
- Should run entirely offline against cached/historical data for development/testing without hitting live sessions.
- Clean seam to later swap in OpenF1's paid live tier (websocket/MQTT) without rearchitecting — abstract the data-fetch layer behind an interface.

## 7. Explicit Non-Goals (v1)
- No real-time paid data feed.
- No claim of exact battery SoC/ERS wattage — estimation only.
- No betting/odds features.
- No user accounts/auth — single-user local tool.

## 8. Suggested Project Structure
```
f1-strategy-app/
  server/
    index.js
    lib/openf1Client.js      # rate-limited, cached fetch wrapper
    lib/ersEstimator.js      # proxy deploy/harvest classifier
    lib/strategySim.js       # tire deg + pit strategy math
    routes/
  client/
    src/
      components/
        TimingBoard.jsx
        StrategySimulator.jsx
        ERSPanel.jsx
      lib/api.js
  REQUIREMENTS.md
```

## 9. Milestones
1. Backend: OpenF1 client + caching + `/api/sessions`, `/api/session/:key/laps|stints|pit|position|weather|race-control`.
2. Frontend: session picker + basic timing board.
3. Strategy simulator (tire deg + pit-loss + undercut/overcut calc), interactive.
4. ERS proxy estimator + lap-trace visualization with disclaimer.
5. Polish: stale-data handling, safety car alerts, driver/team comparison views.
