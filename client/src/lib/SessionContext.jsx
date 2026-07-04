import { createContext, useContext, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "./api";

const SessionContext = createContext(null);

// Normalization parser logic for JSON stream timeline
function computeSimulatedState(events, time) {
  const timing = {};
  const timingApp = {};
  let weather = null;
  let trackStatus = { status: '1', message: 'Clear' };
  const incidents = [];

  const TRACK_STATUS_MAP = {
    '1': 'All Clear',
    '2': 'Yellow Flag',
    '4': 'Safety Car deployed',
    '5': 'Virtual Safety Car deployed',
    '6': 'Red Flag',
    '7': 'Session Resume',
  };

  for (const ev of events) {
    if (ev.offset > time) break;

    const data = ev.data;
    if (ev.topic === "TimingData") {
      if (data && data.Lines) {
        for (const [num, line] of Object.entries(data.Lines)) {
          const existing = timing[num] || {};
          timing[num] = {
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
    } else if (ev.topic === "TimingAppData") {
      if (data && data.Lines) {
        for (const [num, line] of Object.entries(data.Lines)) {
          const existing = timingApp[num] || {};
          let compound = null;
          let tyreAge = null;

          if (line.Stints && line.Stints.length > 0) {
            const lastStint = line.Stints[line.Stints.length - 1];
            compound = lastStint.Compound ?? null;
            tyreAge = lastStint.TotalLaps ?? lastStint.Laps ?? null;
          }

          timingApp[num] = {
            ...existing,
            compound: compound ?? existing.compound ?? null,
            tyreAge: tyreAge ?? existing.tyreAge ?? null,
            inPit: line.InPit ?? existing.inPit ?? false,
          };
        }
      }
    } else if (ev.topic === "WeatherData") {
      if (data) {
        weather = {
          air_temperature: parseFloat(data.AirTemp),
          track_temperature: parseFloat(data.TrackTemp),
          humidity: parseFloat(data.Humidity),
          rainfall: data.Rainfall === '1' || data.Rainfall === true,
          wind_speed: parseFloat(data.WindSpeed),
          wind_direction: parseFloat(data.WindDirection),
          pressure: parseFloat(data.Pressure),
        };
      }
    } else if (ev.topic === "TrackStatus") {
      if (data) {
        trackStatus = {
          status: data.Status || '1',
          message: TRACK_STATUS_MAP[data.Status] || 'Track Clear',
        };
      }
    } else if (ev.topic === "RaceControlMessages") {
      if (data && data.Messages) {
        for (const msg of data.Messages) {
          incidents.push({
            date: msg.Utc || ev.offset,
            category: msg.Category || 'Notice',
            message: msg.Message,
            flag: msg.Flag || null,
          });
        }
      }
    }
  }

  return { timing, timingApp, weather, trackStatus, incidents };
}

function buildSimulatedTimingRows(drivers, timing, timingApp) {
  const parseGap = (str) => {
    if (!str) return null;
    if (typeof str === "string" && str.startsWith("+")) return parseFloat(str.slice(1));
    return parseFloat(str);
  };
  const parseLapTime = (str) => {
    if (!str) return null;
    const parts = str.split(":");
    if (parts.length === 2) return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
    return parseFloat(str);
  };

  return drivers
    .map((d) => {
      const num = String(d.driver_number);
      const t = timing[num] || {};
      const app = timingApp[num] || {};
      
      return {
        driverNumber: d.driver_number,
        name: d.last_name || d.name_acronym,
        acronym: d.name_acronym,
        team: d.team_name,
        teamColor: d.team_colour ? `#${d.team_colour}` : undefined,
        position: t.position ?? null,
        gap: parseGap(t.gap_to_leader),
        interval: parseGap(t.interval),
        lastLap: parseLapTime(t.lastLap),
        bestLap: parseLapTime(t.bestLap),
        sector1: t.sector1 ? parseFloat(t.sector1) : null,
        sector2: t.sector2 ? parseFloat(t.sector2) : null,
        sector3: t.sector3 ? parseFloat(t.sector3) : null,
        compound: app.compound ?? null,
        tyreAge: app.tyreAge ?? null,
        lastLapNumber: app.tyreAge ?? null,
        pitCount: t.pitCount ?? 0,
      };
    })
    .sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
}

export function SessionProvider({ children }) {
  const [session, setSession] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const queryKey = searchParams.get("session_key");

  // Playback Simulation States
  const [isPlaybackMode, setIsPlaybackMode] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(10); // Default to 10x
  const [playbackEvents, setPlaybackEvents] = useState([]);
  const [totalDuration, setTotalDuration] = useState(0);
  const [loadingPlayback, setLoadingPlayback] = useState(false);

  // Playback Simulated Live Data
  const [simulatedRows, setSimulatedRows] = useState([]);
  const [simulatedWeather, setSimulatedWeather] = useState(null);
  const [simulatedIncidents, setSimulatedIncidents] = useState([]);
  const [simulatedTrackStatus, setSimulatedTrackStatus] = useState({ status: '1', message: 'Clear' });

  // Reset playback whenever session key changes
  useEffect(() => {
    setIsPlaybackMode(false);
    setIsPlaying(false);
    setPlaybackTime(0);
    setPlaybackEvents([]);
    setTotalDuration(0);
  }, [queryKey]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function init() {
      try {
        let sessionData;
        if (queryKey) {
          const res = await api.session(queryKey);
          sessionData = res.data;
        } else {
          const res = await api.latestSession();
          sessionData = res.data;
        }

        if (cancelled) return;
        setSession(sessionData);

        if (sessionData?.session_key) {
          const driversRes = await api.drivers(sessionData.session_key);
          if (!cancelled) setDrivers(driversRes.data || []);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [queryKey]);

  // Load LTA Playback logs on demand
  const startPlaybackMode = async () => {
    if (!session?.session_key) return;
    setLoadingPlayback(true);
    try {
      const res = await api.ltaPlayback(session.session_key);
      setPlaybackEvents(res.events || []);
      setTotalDuration(res.totalDuration || 0);
      setPlaybackTime(0);
      setIsPlaybackMode(true);
      setIsPlaying(true);
    } catch (err) {
      setError("Could not initialize playback simulation: " + err.message);
    } finally {
      setLoadingPlayback(false);
    }
  };

  // Playback tick timer
  useEffect(() => {
    if (!isPlaybackMode || !isPlaying) return;

    const interval = setInterval(() => {
      setPlaybackTime((prev) => {
        const next = prev + (0.1 * playbackSpeed);
        if (next >= totalDuration) {
          setIsPlaying(false);
          return totalDuration;
        }
        return next;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaybackMode, isPlaying, playbackSpeed, totalDuration]);

  // Update simulated timing board/weather/incidents when playback time changes
  useEffect(() => {
    if (!isPlaybackMode || playbackEvents.length === 0) return;

    const { timing, timingApp, weather, trackStatus, incidents } = computeSimulatedState(playbackEvents, playbackTime);
    const rows = buildSimulatedTimingRows(drivers, timing, timingApp);

    setSimulatedRows(rows);
    setSimulatedWeather(weather);
    setSimulatedIncidents(incidents.slice(-8).reverse());

    const hasSC = incidents.some(inc => 
      inc.message?.toLowerCase().includes("safety car") || 
      inc.message?.toLowerCase().includes("vsc")
    );
    const scActive = trackStatus.status === '4' || trackStatus.status === '5';
    setSimulatedTrackStatus({
      ...trackStatus,
      safetyCarWindow: { active: scActive || hasSC },
    });
  }, [isPlaybackMode, playbackTime, playbackEvents, drivers]);

  return (
    <SessionContext.Provider 
      value={{ 
        session, 
        drivers, 
        loading, 
        error,
        // Playback Exports
        isPlaybackMode,
        setIsPlaybackMode,
        isPlaying,
        setIsPlaying,
        playbackTime,
        setPlaybackTime,
        playbackSpeed,
        setPlaybackSpeed,
        totalDuration,
        loadingPlayback,
        startPlaybackMode,
        simulatedData: {
          timing: simulatedRows,
          weather: simulatedWeather,
          incidents: simulatedIncidents,
          trackStatus: simulatedTrackStatus,
        }
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
