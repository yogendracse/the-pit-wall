const BASE = "/api";

async function get(path, params = {}) {
  const url = new URL(path, window.location.origin);
  url.pathname = `${BASE}${path}`;
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  }
  const res = await fetch(url.pathname + url.search);
  if (!res.ok) {
    if (res.status === 502 || res.status === 401) {
      throw new Error(
        `OpenF1 API Lockdown (Status ${res.status}). A live F1 session is likely active. The free/unauthenticated tier is temporarily locked from 30 minutes before a session starts until 30 minutes after it ends. Please try again after the session window closes.`
      );
    }
    throw new Error(`API ${res.status}: ${path}`);
  }
  return res.json();
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json();
}

export const api = {
  meetings: (year) => get("/meetings", { year }),
  sessions: (meeting_key) => get("/sessions", { meeting_key }),
  latestSession: () => get("/sessions/latest"),
  session: (key) => get(`/session/${key}`),

  drivers: (key) => get(`/session/${key}/drivers`),
  laps: (key, driver_number) => get(`/session/${key}/laps`, { driver_number }),
  stints: (key, driver_number) => get(`/session/${key}/stints`, { driver_number }),
  pit: (key) => get(`/session/${key}/pit`),
  position: (key) => get(`/session/${key}/position`),
  intervals: (key) => get(`/session/${key}/intervals`),
  weather: (key) => get(`/session/${key}/weather`),
  raceControl: (key) => get(`/session/${key}/race-control`),
  carData: (key, driver_number, date_gte, date_lte) =>
    get(`/session/${key}/car-data`, { driver_number, date_gte, date_lte }),
  ersEstimate: (key, driver_number, date_gte, date_lte) =>
    get(`/session/${key}/ers-estimate`, { driver_number, date_gte, date_lte }),
  degradationFit: (key, compound) => get(`/session/${key}/degradation-fit`, { compound }),

  projectDelta: (payload) => post("/strategy/project-delta", payload),
  undercut: (payload) => post("/strategy/undercut", payload),
};
