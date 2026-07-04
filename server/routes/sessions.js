import { Router } from "express";
import { openf1Get } from "../lib/openf1Client.js";

const router = Router();

router.get("/meetings", async (req, res, next) => {
  try {
    const { year } = req.query;
    const result = await openf1Get("/meetings", year ? { year } : {}, { ttlMs: 60_000 });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/sessions", async (req, res, next) => {
  try {
    const { meeting_key, year } = req.query;
    const result = await openf1Get("/sessions", { meeting_key, year }, { ttlMs: 60_000 });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Most recent completed session, for off-season / no-active-session default.
router.get("/sessions/latest", async (req, res, next) => {
  try {
    const result = await openf1Get("/sessions", {}, { ttlMs: 60_000 });
    const sessions = [...result.data].sort(
      (a, b) => new Date(b.date_start) - new Date(a.date_start)
    );
    const now = Date.now();
    const latest = sessions.find((s) => new Date(s.date_start).getTime() <= now) || sessions[0];
    res.json({ data: latest, stale: result.stale });
  } catch (err) {
    next(err);
  }
});

export default router;
