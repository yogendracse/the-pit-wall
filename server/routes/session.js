import { Router } from "express";
import { openf1Get } from "../lib/openf1Client.js";
import { fitDegradationSlope, safetyCarWindow } from "../lib/strategySim.js";
import { classifySamples, estimateRelativeState, summarizeZones } from "../lib/ersEstimator.js";
import { getLiveState } from "../lib/liveStore.js";
import { getLTASessionState, getLTATelemetry } from "../lib/ltaStore.js";

const router = Router({ mergeParams: true });

const POLL_TTL_MS = 15_000;

// Helper parsing functions
function parseLapTime(str) {
  if (!str) return null;
  const parts = str.split(":");
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return parseFloat(str);
}

function parseGap(str) {
  if (!str) return null;
  if (typeof str === "string" && str.startsWith("+")) {
    return parseFloat(str.slice(1));
  }
  return parseFloat(str);
}

function parseSectorTime(str) {
  if (!str) return null;
  return parseFloat(str);
}

async function getLapsList(key, driver_number, isLive, state) {
  try {
    if (isLive) throw new Error("Force live generation");
    const result = await openf1Get("/laps", { session_key: key, driver_number }, { ttlMs: POLL_TTL_MS });
    return result.data || [];
  } catch (err) {
    // If OpenF1 is 401 or we are in live/LTA mode, build laps list from the state object
    const list = [];
    for (const [num, t] of Object.entries(state.timing)) {
      if (driver_number && num !== String(driver_number)) continue;
      if (t.lastLap) {
        list.push({
          driver_number: parseInt(num),
          lap_number: state.timingApp[num]?.tyreAge || 1,
          lap_duration: parseLapTime(t.lastLap),
          duration_sector_1: parseSectorTime(t.sector1),
          duration_sector_2: parseSectorTime(t.sector2),
          duration_sector_3: parseSectorTime(t.sector3),
        });
      }
    }
    return list;
  }
}

function getStintsFromState(state, driver_number) {
  const stints = [];
  for (const [num, app] of Object.entries(state.timingApp)) {
    if (driver_number && num !== String(driver_number)) continue;
    stints.push({
      driver_number: parseInt(num),
      compound: app.compound,
      lap_start: 1,
      lap_end: app.tyreAge || 1,
    });
  }
  return stints;
}

function getPitsFromState(state) {
  const pits = [];
  for (const [num, t] of Object.entries(state.timing)) {
    for (let i = 0; i < (t.pitCount || 0); i++) {
      pits.push({ driver_number: parseInt(num), lap_number: 1 });
    }
  }
  return pits;
}

function getPositionsFromState(state) {
  const positions = [];
  for (const [num, t] of Object.entries(state.timing)) {
    positions.push({
      driver_number: parseInt(num),
      position: t.position || 20,
      date: new Date().toISOString(),
    });
  }
  return positions;
}

function getIntervalsFromState(state) {
  const intervals = [];
  for (const [num, t] of Object.entries(state.timing)) {
    intervals.push({
      driver_number: parseInt(num),
      gap_to_leader: parseGap(t.gap_to_leader),
      interval: parseGap(t.interval),
      date: new Date().toISOString(),
    });
  }
  return intervals;
}

function filterSamples(samples, date_gte, date_lte) {
  let filtered = samples;
  if (date_gte || date_lte) {
    filtered = filtered.filter((s) => {
      const t = new Date(s.date).getTime();
      if (date_gte && t < new Date(date_gte).getTime()) return false;
      if (date_lte && t > new Date(date_lte).getTime()) return false;
      return true;
    });
  }
  return filtered;
}

router.get("/:key", async (req, res, next) => {
  try {
    const liveState = getLiveState();
    const isLive = req.params.key === "live" || (liveState.active && liveState.sessionInfo.meeting_key && String(liveState.sessionInfo.meeting_key) === req.params.key);
    
    if (isLive && liveState.sessionInfo.session_name) {
      return res.json({ data: liveState.sessionInfo, stale: false });
    }

    // Try LTA static file lookup first
    try {
      const ltaState = await getLTASessionState(req.params.key);
      return res.json({ data: ltaState.sessionInfo, stale: false });
    } catch (err) {
      console.log(`[SessionRoute] LTA session lookup failed for key ${req.params.key}: ${err.message}. Falling back to OpenF1.`);
    }

    const result = await openf1Get("/sessions", { session_key: req.params.key }, { ttlMs: 300_000 });
    res.json({ data: result.data?.[0] || null, stale: result.stale });
  } catch (err) {
    next(err);
  }
});

router.get("/:key/drivers", async (req, res, next) => {
  try {
    const liveState = getLiveState();
    const isLive = req.params.key === "live" || (liveState.active && liveState.sessionInfo.meeting_key && String(liveState.sessionInfo.meeting_key) === req.params.key);
    
    if (isLive && Object.keys(liveState.drivers).length > 0) {
      return res.json({ data: Object.values(liveState.drivers), stale: false });
    }

    // Try LTA
    try {
      const ltaState = await getLTASessionState(req.params.key);
      if (Object.keys(ltaState.drivers).length > 0) {
        return res.json({ data: Object.values(ltaState.drivers), stale: false });
      }
    } catch (err) {
      // Fall through
    }

    const result = await openf1Get("/drivers", { session_key: req.params.key }, { ttlMs: 300_000 });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/:key/laps", async (req, res, next) => {
  try {
    const { driver_number } = req.query;
    const liveState = getLiveState();
    const isLive = req.params.key === "live" || (liveState.active && liveState.sessionInfo.meeting_key && String(liveState.sessionInfo.meeting_key) === req.params.key);

    if (isLive) {
      const data = await getLapsList(req.params.key, driver_number, isLive, liveState);
      return res.json({ data, stale: false });
    }

    // Try LTA
    try {
      const ltaState = await getLTASessionState(req.params.key);
      const data = await getLapsList(req.params.key, driver_number, false, ltaState);
      return res.json({ data, stale: false });
    } catch (err) {
      // Fall through
    }

    const result = await openf1Get("/laps", { session_key: req.params.key, driver_number }, { ttlMs: POLL_TTL_MS });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/:key/stints", async (req, res, next) => {
  try {
    const { driver_number } = req.query;
    const liveState = getLiveState();
    const isLive = req.params.key === "live" || (liveState.active && liveState.sessionInfo.meeting_key && String(liveState.sessionInfo.meeting_key) === req.params.key);

    if (isLive) {
      const stints = getStintsFromState(liveState, driver_number);
      return res.json({ data: stints, stale: false });
    }

    // Try LTA
    try {
      const ltaState = await getLTASessionState(req.params.key);
      const stints = getStintsFromState(ltaState, driver_number);
      return res.json({ data: stints, stale: false });
    } catch (err) {
      // Fall through
    }

    const result = await openf1Get("/stints", { session_key: req.params.key, driver_number }, { ttlMs: POLL_TTL_MS });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/:key/pit", async (req, res, next) => {
  try {
    const liveState = getLiveState();
    const isLive = req.params.key === "live" || (liveState.active && liveState.sessionInfo.meeting_key && String(liveState.sessionInfo.meeting_key) === req.params.key);

    if (isLive) {
      const pits = getPitsFromState(liveState);
      return res.json({ data: pits, stale: false });
    }

    // Try LTA
    try {
      const ltaState = await getLTASessionState(req.params.key);
      const pits = getPitsFromState(ltaState);
      return res.json({ data: pits, stale: false });
    } catch (err) {
      // Fall through
    }

    const result = await openf1Get("/pit", { session_key: req.params.key }, { ttlMs: POLL_TTL_MS });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/:key/position", async (req, res, next) => {
  try {
    const liveState = getLiveState();
    const isLive = req.params.key === "live" || (liveState.active && liveState.sessionInfo.meeting_key && String(liveState.sessionInfo.meeting_key) === req.params.key);

    if (isLive) {
      const positions = getPositionsFromState(liveState);
      return res.json({ data: positions, stale: false });
    }

    // Try LTA
    try {
      const ltaState = await getLTASessionState(req.params.key);
      const positions = getPositionsFromState(ltaState);
      return res.json({ data: positions, stale: false });
    } catch (err) {
      // Fall through
    }

    const result = await openf1Get("/position", { session_key: req.params.key }, { ttlMs: POLL_TTL_MS });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/:key/intervals", async (req, res, next) => {
  try {
    const liveState = getLiveState();
    const isLive = req.params.key === "live" || (liveState.active && liveState.sessionInfo.meeting_key && String(liveState.sessionInfo.meeting_key) === req.params.key);

    if (isLive) {
      const intervals = getIntervalsFromState(liveState);
      return res.json({ data: intervals, stale: false });
    }

    // Try LTA
    try {
      const ltaState = await getLTASessionState(req.params.key);
      const intervals = getIntervalsFromState(ltaState);
      return res.json({ data: intervals, stale: false });
    } catch (err) {
      // Fall through
    }

    const result = await openf1Get("/intervals", { session_key: req.params.key }, { ttlMs: POLL_TTL_MS });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/:key/weather", async (req, res, next) => {
  try {
    const liveState = getLiveState();
    const isLive = req.params.key === "live" || (liveState.active && liveState.sessionInfo.meeting_key && String(liveState.sessionInfo.meeting_key) === req.params.key);

    if (isLive && liveState.weather) {
      return res.json({ data: [liveState.weather], stale: false });
    }

    // Try LTA
    try {
      const ltaState = await getLTASessionState(req.params.key);
      if (ltaState.weather) {
        return res.json({ data: [ltaState.weather], stale: false });
      }
    } catch (err) {
      // Fall through
    }

    const result = await openf1Get("/weather", { session_key: req.params.key }, { ttlMs: POLL_TTL_MS });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/:key/race-control", async (req, res, next) => {
  try {
    const liveState = getLiveState();
    const isLive = req.params.key === "live" || (liveState.active && liveState.sessionInfo.meeting_key && String(liveState.sessionInfo.meeting_key) === req.params.key);

    if (isLive && liveState.incidents.length > 0) {
      const scWindow = safetyCarWindow(liveState.incidents);
      return res.json({ data: liveState.incidents, safetyCarWindow: scWindow, stale: false });
    }

    // Try LTA
    try {
      const ltaState = await getLTASessionState(req.params.key);
      if (ltaState.incidents.length > 0) {
        const scWindow = safetyCarWindow(ltaState.incidents);
        return res.json({ data: ltaState.incidents, safetyCarWindow: scWindow, stale: false });
      }
    } catch (err) {
      // Fall through
    }

    const result = await openf1Get("/race_control", { session_key: req.params.key }, { ttlMs: POLL_TTL_MS });
    const scWindow = safetyCarWindow(result.data);
    res.json({ ...result, safetyCarWindow: scWindow });
  } catch (err) {
    next(err);
  }
});

// Raw car_data channel for one driver — sole input to the ERS proxy model.
router.get("/:key/car-data", async (req, res, next) => {
  try {
    const { driver_number, date_gte, date_lte } = req.query;
    if (!driver_number) return res.status(400).json({ error: "driver_number is required" });
    const liveState = getLiveState();
    const isLive = req.params.key === "live" || (liveState.active && liveState.sessionInfo.meeting_key && String(liveState.sessionInfo.meeting_key) === req.params.key);
    
    if (isLive && liveState.carData[driver_number]) {
      const samples = filterSamples(liveState.carData[driver_number], date_gte, date_lte);
      return res.json({ data: samples, stale: false });
    }

    // Try LTA
    try {
      const ltaSamples = await getLTATelemetry(req.params.key, driver_number);
      if (ltaSamples && ltaSamples.length > 0) {
        const samples = filterSamples(ltaSamples, date_gte, date_lte);
        return res.json({ data: samples, stale: false });
      }
    } catch (err) {
      // Fall through
    }

    const result = await openf1Get(
      "/car_data",
      { session_key: req.params.key, driver_number, date_gte, date_lte },
      { ttlMs: POLL_TTL_MS }
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ERS proxy estimator output for one driver over a lap/time window.
router.get("/:key/ers-estimate", async (req, res, next) => {
  try {
    const { driver_number, date_gte, date_lte } = req.query;
    if (!driver_number) return res.status(400).json({ error: "driver_number is required" });
    const liveState = getLiveState();
    const isLive = req.params.key === "live" || (liveState.active && liveState.sessionInfo.meeting_key && String(liveState.sessionInfo.meeting_key) === req.params.key);

    let samples = [];
    let stale = false;

    if (isLive && liveState.carData[driver_number]) {
      samples = filterSamples(liveState.carData[driver_number], date_gte, date_lte);
    } else {
      // Try LTA
      let loadedFromLTA = false;
      try {
        const ltaSamples = await getLTATelemetry(req.params.key, driver_number);
        if (ltaSamples && ltaSamples.length > 0) {
          samples = filterSamples(ltaSamples, date_gte, date_lte);
          loadedFromLTA = true;
        }
      } catch (err) {
        // Fall through
      }

      if (!loadedFromLTA) {
        const result = await openf1Get(
          "/car_data",
          { session_key: req.params.key, driver_number, date_gte, date_lte },
          { ttlMs: POLL_TTL_MS }
        );
        samples = result.data || [];
        stale = result.stale;
      }
    }

    const classified = classifySamples(samples);
    const withState = estimateRelativeState(classified);
    const summary = summarizeZones(classified);
    res.json({
      data: withState,
      summary,
      stale,
      disclaimer:
        "Estimated from public telemetry (throttle/speed/RPM/DRS). Not actual battery data — F1 does not publish ERS deployment or state-of-charge.",
    });
  } catch (err) {
    next(err);
  }
});

// Fit a rough per-compound degradation slope from this session's actual laps.
router.get("/:key/degradation-fit", async (req, res, next) => {
  try {
    const { compound = "MEDIUM" } = req.query;
    let laps = [];
    let stints = [];

    // Try LTA
    let loadedFromLTA = false;
    try {
      const ltaState = await getLTASessionState(req.params.key);
      laps = await getLapsList(req.params.key, null, false, ltaState);
      stints = getStintsFromState(ltaState, null);
      loadedFromLTA = true;
    } catch (err) {
      // Fall through
    }

    if (!loadedFromLTA) {
      const lapsResult = await openf1Get("/laps", { session_key: req.params.key }, { ttlMs: POLL_TTL_MS });
      const stintsResult = await openf1Get("/stints", { session_key: req.params.key }, { ttlMs: POLL_TTL_MS });
      laps = lapsResult.data || [];
      stints = stintsResult.data || [];
    }

    const stintByLap = new Map();
    for (const stint of stints) {
      for (let lap = stint.lap_start; lap <= stint.lap_end; lap++) {
        stintByLap.set(`${stint.driver_number}-${lap}`, stint);
      }
    }

    const enriched = laps
      .map((l) => {
        const stint = stintByLap.get(`${l.driver_number}-${l.lap_number}`);
        return stint
          ? {
              lapNumber: l.lap_number,
              lapTimeSec: l.lap_duration,
              tireAge: l.lap_number - stint.lap_start,
              compound: stint.compound,
            }
          : null;
      })
      .filter(Boolean);

    const slope = fitDegradationSlope(enriched, compound.toUpperCase());
    res.json({ compound: compound.toUpperCase(), secPerLap: slope, sampleSize: enriched.length });
  } catch (err) {
    next(err);
  }
});

export default router;
