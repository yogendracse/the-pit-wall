import fs from 'fs';
import path from 'path';
import axios from 'axios';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_DIR = path.join(__dirname, '../cache/lta');

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

const LTA_BASE = 'https://livetiming.formula1.com/static';
const YEARS = [2026, 2025, 2024, 2023];

// In-memory cache of session states
const sessionCache = new Map(); // sessionKey -> sessionState

// Keep a map of resolved session metadata (key -> { path, year })
const resolvedSessions = new Map();

// Helper to download a file with local disk caching
async function fetchWithCache(url, cacheFilename) {
  const cachePath = path.join(CACHE_DIR, cacheFilename);

  // Return local file if it exists
  if (fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath, 'utf8');
  }

  console.log(`[LTAStore] Downloading from F1: ${url}`);
  const resp = await axios.get(url, {
    headers: {
      'User-Agent': 'BestHTTP',
      'Accept-Encoding': 'gzip,identity',
    },
    responseType: 'text',
  });

  const data = resp.data;
  fs.writeFileSync(cachePath, data, 'utf8');
  return data;
}

// Search LTA Index files to locate a session by key
async function locateSession(sessionKey) {
  const key = Number(sessionKey);
  if (resolvedSessions.has(key)) {
    return resolvedSessions.get(key);
  }

  for (const year of YEARS) {
    try {
      const indexUrl = `${LTA_BASE}/${year}/Index.json`;
      const cacheFile = `index_${year}.json`;
      const indexText = await fetchWithCache(indexUrl, cacheFile);
      const index = JSON.parse(indexText);

      for (const meeting of index.Meetings || []) {
        for (const session of meeting.Sessions || []) {
          if (session.Key === key) {
            const meta = {
              year,
              path: session.Path,
              name: session.Name,
              type: session.Type,
              meetingName: meeting.Name,
              circuitName: meeting.Circuit?.ShortName || '',
            };
            resolvedSessions.set(key, meta);
            return meta;
          }
        }
      }
    } catch (err) {
      console.warn(`[LTAStore] Index search for year ${year} failed:`, err.message);
    }
  }

  return null;
}

// Decode compressed base64 strings from CarData / Position
function decodeCompressedPayload(base64Str) {
  try {
    const buf = Buffer.from(base64Str, 'base64');
    const inflated = zlib.inflateRawSync(buf);
    return JSON.parse(inflated.toString('utf8'));
  } catch (err) {
    try {
      const buf = Buffer.from(base64Str, 'base64');
      const inflated = zlib.inflateSync(buf);
      return JSON.parse(inflated.toString('utf8'));
    } catch (err2) {
      throw new Error(`Failed to decompress LTA payload: ${err.message} / ${err2.message}`);
    }
  }
}

// Parse F1 .jsonStream timing logs
function parseJsonStream(text, onLine) {
  const lines = text.split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    
    // Find first occurrence of '{' or '"' which denotes the start of JSON
    const firstBrace = line.indexOf('{');
    const firstQuote = line.indexOf('"');
    let startIndex = -1;
    if (firstBrace !== -1 && firstQuote !== -1) {
      startIndex = Math.min(firstBrace, firstQuote);
    } else {
      startIndex = firstBrace !== -1 ? firstBrace : firstQuote;
    }
    if (startIndex === -1) continue;

    const timestamp = line.substring(0, startIndex);
    const jsonContent = line.substring(startIndex);
    try {
      let parsed = JSON.parse(jsonContent);
      onLine(parsed, timestamp);
    } catch (e) {
      // ignore parsing errors for corrupt/partial lines
    }
  }
}

// Normalizer logic matching liveStore.js
function applyTimingData(state, data) {
  if (!data || !data.Lines) return;
  for (const [num, line] of Object.entries(data.Lines)) {
    const existing = state.timing[num] || {};
    state.timing[num] = {
      ...existing,
      position: line.Position ?? existing.position ?? null,
      gap_to_leader: line.GapToLeader ?? existing.gap_to_leader ?? null,
      interval: line.IntervalToPositionAhead?.Value ?? existing.interval ?? null,
      lastLap: line.LastLapTime?.Value ?? existing.lastLap ?? null,
      bestLap: line.BestLapTime?.Value ?? existing.bestLap ?? null,
      sector1: line.Sectors?.[0]?.Value ?? existing.sector1 ?? null,
      sector2: line.Sectors?.[1]?.Value ?? existing.sector2 ?? null,
      sector3: line.Sectors?.[2]?.Value ?? existing.sector3 ?? null,
      pitCount: line.NumberOfPitstops ?? existing.pitCount ?? 0,
      inPit: line.InPit ?? existing.inPit ?? false,
    };
  }
}

function applyTimingAppData(state, data) {
  if (!data || !data.Lines) return;
  for (const [num, line] of Object.entries(data.Lines)) {
    const existing = state.timingApp[num] || {};
    let compound = null;
    let tyreAge = null;

    if (line.Stints && line.Stints.length > 0) {
      const lastStint = line.Stints[line.Stints.length - 1];
      compound = lastStint.Compound ?? null;
      tyreAge = lastStint.TotalLaps ?? lastStint.Laps ?? null;
    }

    state.timingApp[num] = {
      ...existing,
      compound: compound ?? existing.compound ?? null,
      tyreAge: tyreAge ?? existing.tyreAge ?? null,
      inPit: line.InPit ?? existing.inPit ?? false,
    };
  }
}

function applyCarData(state, data) {
  if (!data || !data.Entries) return;
  for (const entry of data.Entries) {
    const time = entry.Utc;
    if (!entry.Cars) continue;
    
    for (const [num, car] of Object.entries(entry.Cars)) {
      if (!car.Channels) continue;
      
      const ch = car.Channels;
      const sample = {
        date: time,
        rpm: ch['0'] ?? 0,
        speed: ch['1'] ?? 0,
        n_gear: ch['2'] ?? 0,
        throttle: ch['3'] ?? 0,
        brake: ch['4'] ?? 0,
        drs: ch['5'] ?? 0,
      };

      if (!state.carData[num]) {
        state.carData[num] = [];
      }
      state.carData[num].push(sample);
    }
  }
}

// Main function to load a historical session from LTA
export async function getLTASessionState(sessionKey) {
  const key = Number(sessionKey);
  
  if (sessionCache.has(key)) {
    return sessionCache.get(key);
  }

  const meta = await locateSession(key);
  if (!meta) {
    throw new Error(`Session ${key} not found in F1 LTA index`);
  }

  console.log(`[LTAStore] Loading session ${key} (${meta.meetingName} - ${meta.name})`);
  const basePath = `${LTA_BASE}/${meta.path}`;

  // Initialize state
  const state = {
    sessionInfo: {
      session_key: key,
      session_name: meta.name,
      session_type: meta.type,
      circuit_short_name: meta.circuitName,
      meeting_key: null, // Filled via SessionInfo if present
    },
    drivers: {},
    timing: {},
    timingApp: {},
    weather: null,
    trackStatus: { status: '1', message: 'Clear' },
    incidents: [],
    carData: {},
    carDataLoaded: false,
  };

  // 1. Download DriverList.json
  try {
    const driversText = await fetchWithCache(`${basePath}DriverList.json`, `${key}_DriverList.json`);
    const driversData = JSON.parse(driversText);
    for (const [num, d] of Object.entries(driversData)) {
      state.drivers[num] = {
        driver_number: parseInt(num),
        broadcast_name: d.BroadcastName,
        full_name: d.FullName,
        name_acronym: d.Tla || d.NameAcronym,
        team_name: d.TeamName,
        team_colour: d.TeamColour,
        first_name: d.FirstName,
        last_name: d.LastName,
        headshot_url: d.HeadshotUrl,
      };
    }
  } catch (err) {
    console.warn(`[LTAStore] Failed to load DriverList:`, err.message);
  }

  // 2. Download SessionInfo.json
  try {
    const infoText = await fetchWithCache(`${basePath}SessionInfo.json`, `${key}_SessionInfo.json`);
    const infoData = JSON.parse(infoText);
    state.sessionInfo.meeting_key = infoData.Meeting?.Key || null;
  } catch (err) {
    console.warn(`[LTAStore] Failed to load SessionInfo:`, err.message);
  }

  // 3. Download and Parse TimingData.jsonStream
  try {
    const timingText = await fetchWithCache(`${basePath}TimingData.jsonStream`, `${key}_TimingData.jsonStream`);
    parseJsonStream(timingText, (data) => {
      applyTimingData(state, data);
    });
  } catch (err) {
    console.warn(`[LTAStore] Failed to load TimingData stream:`, err.message);
  }

  // 4. Download and Parse TimingAppData.jsonStream
  try {
    const timingAppText = await fetchWithCache(`${basePath}TimingAppData.jsonStream`, `${key}_TimingAppData.jsonStream`);
    parseJsonStream(timingAppText, (data) => {
      applyTimingAppData(state, data);
    });
  } catch (err) {
    console.warn(`[LTAStore] Failed to load TimingAppData stream:`, err.message);
  }

  // 5. Download and Parse TrackStatus.jsonStream
  try {
    const statusText = await fetchWithCache(`${basePath}TrackStatus.jsonStream`, `${key}_TrackStatus.jsonStream`);
    const statusMap = {
      '1': 'All Clear',
      '2': 'Yellow Flag',
      '4': 'Safety Car deployed',
      '5': 'Virtual Safety Car deployed',
      '6': 'Red Flag',
      '7': 'Session Resume',
    };
    parseJsonStream(statusText, (data) => {
      if (data) {
        state.trackStatus = {
          status: data.Status || '1',
          message: statusMap[data.Status] || 'Track Clear',
        };
      }
    });
  } catch (err) {
    console.warn(`[LTAStore] Failed to load TrackStatus stream:`, err.message);
  }

  // 6. Download and Parse WeatherData.jsonStream
  try {
    const weatherText = await fetchWithCache(`${basePath}WeatherData.jsonStream`, `${key}_WeatherData.jsonStream`);
    parseJsonStream(weatherText, (data) => {
      if (data) {
        state.weather = {
          air_temperature: parseFloat(data.AirTemp),
          track_temperature: parseFloat(data.TrackTemp),
          humidity: parseFloat(data.Humidity),
          rainfall: data.Rainfall === '1' || data.Rainfall === true,
          wind_speed: parseFloat(data.WindSpeed),
          wind_direction: parseFloat(data.WindDirection),
          pressure: parseFloat(data.Pressure),
        };
      }
    });
  } catch (err) {
    console.warn(`[LTAStore] Failed to load WeatherData stream:`, err.message);
  }

  // 7. Download and Parse RaceControlMessages.jsonStream
  try {
    const raceControlText = await fetchWithCache(`${basePath}RaceControlMessages.jsonStream`, `${key}_RaceControlMessages.jsonStream`);
    parseJsonStream(raceControlText, (data, timestamp) => {
      if (data && data.Messages) {
        for (const msg of data.Messages) {
          state.incidents.push({
            date: msg.Utc || timestamp,
            category: msg.Category || 'Notice',
            message: msg.Message,
            flag: msg.Flag || null,
          });
        }
      }
    });
  } catch (err) {
    console.warn(`[LTAStore] Failed to load RaceControlMessages stream:`, err.message);
  }

  sessionCache.set(key, state);
  return state;
}

// Download and Parse telemetry on-demand
export async function getLTATelemetry(sessionKey, driverNumber) {
  const key = Number(sessionKey);
  const state = await getLTASessionState(key);
  const numStr = String(driverNumber);

  if (state.carDataLoaded) {
    return state.carData[numStr] || [];
  }

  const meta = await locateSession(key);
  const basePath = `${LTA_BASE}/${meta.path}`;

  try {
    console.log(`[LTAStore] Downloading CarData telemetry stream for session ${key}...`);
    const carDataText = await fetchWithCache(`${basePath}CarData.z.jsonStream`, `${key}_CarData.z.jsonStream`);
    
    parseJsonStream(carDataText, (payload) => {
      if (typeof payload === 'string') {
        const decoded = decodeCompressedPayload(payload);
        applyCarData(state, decoded);
      }
    });

    state.carDataLoaded = true;
  } catch (err) {
    console.warn(`[LTAStore] Failed to load CarData telemetry:`, err.message);
  }

  return state.carData[numStr] || [];
}
