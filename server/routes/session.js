import { Router } from "express";
import { openf1Get } from "../lib/openf1Client.js";
import { fitDegradationSlope, safetyCarWindow } from "../lib/strategySim.js";
import { classifySamples, estimateRelativeState, summarizeZones } from "../lib/ersEstimator.js";

const router = Router({ mergeParams: true });

const POLL_TTL_MS = 15_000;

router.get("/:key", async (req, res, next) => {
  try {
    const result = await openf1Get("/sessions", { session_key: req.params.key }, { ttlMs: 300_000 });
    res.json({ data: result.data?.[0] || null, stale: result.stale });
  } catch (err) {
    next(err);
  }
});

router.get("/:key/drivers", async (req, res, next) => {
  try {
    const result = await openf1Get("/drivers", { session_key: req.params.key }, { ttlMs: 300_000 });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/:key/laps", async (req, res, next) => {
  try {
    const { driver_number } = req.query;
    const result = await openf1Get(
      "/laps",
      { session_key: req.params.key, driver_number },
      { ttlMs: POLL_TTL_MS }
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/:key/stints", async (req, res, next) => {
  try {
    const { driver_number } = req.query;
    const result = await openf1Get(
      "/stints",
      { session_key: req.params.key, driver_number },
      { ttlMs: POLL_TTL_MS }
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/:key/pit", async (req, res, next) => {
  try {
    const result = await openf1Get("/pit", { session_key: req.params.key }, { ttlMs: POLL_TTL_MS });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/:key/position", async (req, res, next) => {
  try {
    const result = await openf1Get("/position", { session_key: req.params.key }, { ttlMs: POLL_TTL_MS });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/:key/intervals", async (req, res, next) => {
  try {
    const result = await openf1Get("/intervals", { session_key: req.params.key }, { ttlMs: POLL_TTL_MS });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/:key/weather", async (req, res, next) => {
  try {
    const result = await openf1Get("/weather", { session_key: req.params.key }, { ttlMs: POLL_TTL_MS });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/:key/race-control", async (req, res, next) => {
  try {
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
    const result = await openf1Get(
      "/car_data",
      { session_key: req.params.key, driver_number, date_gte, date_lte },
      { ttlMs: POLL_TTL_MS }
    );
    const classified = classifySamples(result.data);
    const withState = estimateRelativeState(classified);
    const summary = summarizeZones(classified);
    res.json({
      data: withState,
      summary,
      stale: result.stale,
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
    const lapsResult = await openf1Get("/laps", { session_key: req.params.key }, { ttlMs: POLL_TTL_MS });
    const stintsResult = await openf1Get("/stints", { session_key: req.params.key }, { ttlMs: POLL_TTL_MS });

    const stintByLap = new Map();
    for (const stint of stintsResult.data) {
      for (let lap = stint.lap_start; lap <= stint.lap_end; lap++) {
        stintByLap.set(`${stint.driver_number}-${lap}`, stint);
      }
    }

    const enriched = lapsResult.data
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
