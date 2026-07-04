import express from "express";
import cors from "cors";
import sessionsRouter from "./routes/sessions.js";
import sessionRouter from "./routes/session.js";
import strategyRouter from "./routes/strategy.js";
import { cacheStats } from "./lib/openf1Client.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true, ...cacheStats() }));

app.use("/api", sessionsRouter);
app.use("/api/session", sessionRouter);
app.use("/api/strategy", strategyRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(502).json({ error: err.message || "Upstream error" });
});

app.listen(PORT, () => {
  console.log(`F1 strategy server listening on http://localhost:${PORT}`);
});
