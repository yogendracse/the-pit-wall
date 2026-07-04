import { Router } from "express";
import { projectDelta, undercutAnalysis } from "../lib/strategySim.js";

const router = Router();

// Exposed so the client can validate its own recompute logic, or run it
// server-side if desired. Client should cache session data and recompute
// locally on slider tweaks — this is not meant to be polled per-keystroke.
router.post("/project-delta", (req, res) => {
  res.json(projectDelta(req.body));
});

router.post("/undercut", (req, res) => {
  res.json(undercutAnalysis(req.body));
});

export default router;
