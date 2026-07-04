import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { useSession } from "./SessionContext";

const POLL_MS = 15_000;

function latestByDriver(rows, keyFn = (r) => r.driver_number) {
  const map = new Map();
  for (const row of rows) {
    const k = keyFn(row);
    const existing = map.get(k);
    if (!existing || new Date(row.date) > new Date(existing.date)) map.set(k, row);
  }
  return map;
}

function bestLapByDriver(laps) {
  const map = new Map();
  for (const lap of laps) {
    if (!Number.isFinite(lap.lap_duration)) continue;
    const existing = map.get(lap.driver_number);
    if (!existing || lap.lap_duration < existing.lap_duration) map.set(lap.driver_number, lap);
  }
  return map;
}

function lastLapByDriver(laps) {
  const map = new Map();
  for (const lap of laps) {
    const existing = map.get(lap.driver_number);
    if (!existing || lap.lap_number > existing.lap_number) map.set(lap.driver_number, lap);
  }
  return map;
}

function currentStintByDriver(stints) {
  const map = new Map();
  for (const s of stints) {
    const existing = map.get(s.driver_number);
    if (!existing || s.lap_start > existing.lap_start) map.set(s.driver_number, s);
  }
  return map;
}

function pitCountByDriver(pits) {
  const map = new Map();
  for (const p of pits) map.set(p.driver_number, (map.get(p.driver_number) || 0) + 1);
  return map;
}

export function useTimingBoard(sessionKey) {
  const context = useSession();
  const isPlayback = context?.isPlaybackMode;

  const [state, setState] = useState({
    rows: [],
    weather: null,
    raceControl: [],
    stale: false,
    loading: true,
    error: null,
  });
  const timerRef = useRef(null);

  useEffect(() => {
    if (isPlayback) {
      setState({
        rows: context.simulatedData.timing || [],
        weather: context.simulatedData.weather || null,
        raceControl: context.simulatedData.incidents || [],
        safetyCarWindow: context.simulatedData.trackStatus?.safetyCarWindow || { active: false },
        stale: false,
        loading: false,
        error: null,
      });
      return;
    }

    if (!sessionKey) return;
    let cancelled = false;

    async function poll() {
      try {
        const [driversRes, lapsRes, stintsRes, pitRes, positionRes, intervalsRes, weatherRes, rcRes] =
          await Promise.all([
            api.drivers(sessionKey),
            api.laps(sessionKey),
            api.stints(sessionKey),
            api.pit(sessionKey),
            api.position(sessionKey),
            api.intervals(sessionKey),
            api.weather(sessionKey),
            api.raceControl(sessionKey),
          ]);
        if (cancelled) return;

        const positions = latestByDriver(positionRes.data);
        const intervals = latestByDriver(intervalsRes.data);
        const bestLaps = bestLapByDriver(lapsRes.data);
        const lastLaps = lastLapByDriver(lapsRes.data);
        const stints = currentStintByDriver(stintsRes.data);
        const pitCounts = pitCountByDriver(pitRes.data);

        const rows = driversRes.data
          .map((d) => {
            const pos = positions.get(d.driver_number);
            const interval = intervals.get(d.driver_number);
            const best = bestLaps.get(d.driver_number);
            const last = lastLaps.get(d.driver_number);
            const stint = stints.get(d.driver_number);
            return {
              driverNumber: d.driver_number,
              name: d.last_name || d.name_acronym,
              acronym: d.name_acronym,
              team: d.team_name,
              teamColor: d.team_colour ? `#${d.team_colour}` : undefined,
              position: pos?.position ?? null,
              gap: interval?.gap_to_leader ?? null,
              interval: interval?.interval ?? null,
              lastLap: last?.lap_duration ?? null,
              bestLap: best?.lap_duration ?? null,
              sector1: last?.duration_sector_1 ?? null,
              sector2: last?.duration_sector_2 ?? null,
              sector3: last?.duration_sector_3 ?? null,
              compound: stint?.compound ?? null,
              tyreAge: stint && last?.lap_number != null ? last.lap_number - stint.lap_start : null,
              lastLapNumber: last?.lap_number ?? null,
              pitCount: pitCounts.get(d.driver_number) || 0,
            };
          })
          .sort((a, b) => (a.position ?? 99) - (b.position ?? 99));

        const stale = [driversRes, lapsRes, stintsRes, pitRes, positionRes, intervalsRes, weatherRes, rcRes].some(
          (r) => r.stale
        );

        setState({
          rows,
          weather: weatherRes.data?.[weatherRes.data.length - 1] || null,
          raceControl: rcRes.data.slice(-8).reverse(),
          safetyCarWindow: rcRes.safetyCarWindow,
          stale,
          loading: false,
          error: null,
        });
      } catch (err) {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: err.message }));
      }
    }

    poll();
    timerRef.current = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timerRef.current);
    };
  }, [sessionKey, isPlayback, context?.simulatedData]);

  return state;
}

export function formatSec(sec) {
  if (sec === null || sec === undefined || Number.isNaN(sec)) return "—";
  if (sec < 60) return sec.toFixed(3);
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(3).padStart(6, "0");
  return `${m}:${s}`;
}

export function formatGap(sec) {
  if (sec === null || sec === undefined) return "—";
  if (typeof sec === "string") return sec;
  return `+${sec.toFixed(3)}`;
}
