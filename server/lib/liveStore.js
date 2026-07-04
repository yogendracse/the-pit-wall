import { F1LiveTimingClient } from './signalRClient.js';

// In-memory live state store
const liveState = {
  active: false,
  sessionInfo: {},
  drivers: {},        // driverNumber -> driverInfo
  timing: {},         // driverNumber -> timingLine
  timingApp: {},      // driverNumber -> timingAppLine
  weather: null,
  trackStatus: { status: '1', message: 'Clear' },
  incidents: [],      // array of race control messages
  carData: {},        // driverNumber -> Array of rolling telemetry samples
};

// Track status mapping from F1 SignalR spec
const TRACK_STATUS_MAP = {
  '1': 'All Clear',
  '2': 'Yellow Flag',
  '4': 'Safety Car deployed',
  '5': 'Virtual Safety Car deployed',
  '6': 'Red Flag',
  '7': 'Session Resume',
};

const MAX_TELEMETRY_SAMPLES = 2000; // Keep ~10 minutes of data at 3.7Hz

function updateDriverList(data) {
  if (!data) return;
  for (const [num, d] of Object.entries(data)) {
    liveState.drivers[num] = {
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
}

function updateTimingData(data) {
  if (!data || !data.Lines) return;
  for (const [num, line] of Object.entries(data.Lines)) {
    const existing = liveState.timing[num] || {};
    liveState.timing[num] = {
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

function updateTimingAppData(data) {
  if (!data || !data.Lines) return;
  for (const [num, line] of Object.entries(data.Lines)) {
    const existing = liveState.timingApp[num] || {};
    let compound = null;
    let tyreAge = null;

    if (line.Stints && line.Stints.length > 0) {
      const lastStint = line.Stints[line.Stints.length - 1];
      compound = lastStint.Compound ?? null;
      tyreAge = lastStint.TotalLaps ?? lastStint.Laps ?? null;
    }

    liveState.timingApp[num] = {
      ...existing,
      compound: compound ?? existing.compound ?? null,
      tyreAge: tyreAge ?? existing.tyreAge ?? null,
      inPit: line.InPit ?? existing.inPit ?? false,
    };
  }
}

function updateCarData(data) {
  if (!data || !data.Entries) return;
  
  for (const entry of data.Entries) {
    const time = entry.Utc;
    if (!entry.Cars) continue;
    
    for (const [num, car] of Object.entries(entry.Cars)) {
      if (!car.Channels) continue;
      
      // OpenF1 channels standard mapping:
      // Channel 0: RPM, Channel 1: Speed, Channel 2: Gear, Channel 3: Throttle %, Channel 4: Brake (0/1), Channel 5: DRS (0-1)
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

      if (!liveState.carData[num]) {
        liveState.carData[num] = [];
      }
      
      liveState.carData[num].push(sample);
      if (liveState.carData[num].length > MAX_TELEMETRY_SAMPLES) {
        liveState.carData[num].shift();
      }
    }
  }
}

// Instantiate the client
const client = new F1LiveTimingClient({
  onMessage: (topic, data, timestamp) => {
    liveState.active = true;
    
    switch (topic) {
      case 'DriverList':
        updateDriverList(data);
        break;
      case 'TimingData':
        updateTimingData(data);
        break;
      case 'TimingAppData':
        updateTimingAppData(data);
        break;
      case 'CarData':
        updateCarData(data);
        break;
      case 'WeatherData':
        if (data) {
          liveState.weather = {
            air_temperature: parseFloat(data.AirTemp),
            track_temperature: parseFloat(data.TrackTemp),
            humidity: parseFloat(data.Humidity),
            rainfall: data.Rainfall === '1' || data.Rainfall === true,
            wind_speed: parseFloat(data.WindSpeed),
            wind_direction: parseFloat(data.WindDirection),
            pressure: parseFloat(data.Pressure),
          };
        }
        break;
      case 'TrackStatus':
        if (data) {
          liveState.trackStatus = {
            status: data.Status || '1',
            message: TRACK_STATUS_MAP[data.Status] || 'Track Clear',
          };
        }
        break;
      case 'RaceControlMessages':
        if (data && data.Messages) {
          for (const msg of data.Messages) {
            const parsed = {
              date: msg.Utc || timestamp,
              category: msg.Category || 'Notice',
              message: msg.Message,
              flag: msg.Flag || null,
            };
            liveState.incidents.push(parsed);
          }
          // Keep only last 100 incident messages
          if (liveState.incidents.length > 100) {
            liveState.incidents = liveState.incidents.slice(-100);
          }
        }
        break;
      case 'SessionInfo':
      case 'SessionData':
        if (data) {
          liveState.sessionInfo = {
            ...liveState.sessionInfo,
            session_name: data.Name || liveState.sessionInfo.session_name,
            session_type: data.Type || liveState.sessionInfo.session_type,
            circuit_short_name: data.Meeting?.Circuit?.ShortName || liveState.sessionInfo.circuit_short_name,
            meeting_key: data.Meeting?.Key || liveState.sessionInfo.meeting_key,
          };
        }
        break;
    }
  },
  onError: (err) => {
    console.error('[F1LiveStore] Connection error:', err.message);
  },
  onClose: () => {
    console.log('[F1LiveStore] Connection closed');
    liveState.active = false;
  },
});

// Auto-connect on module load
export function startLiveMonitoring() {
  console.log('[F1LiveStore] Initializing Live Timing SignalR Feed...');
  client.connect().catch((err) => {
    console.warn('[F1LiveStore] Could not connect to Live Timing (session likely off-line):', err.message);
  });
}

export function stopLiveMonitoring() {
  client.close();
}

export function getLiveState() {
  return liveState;
}
