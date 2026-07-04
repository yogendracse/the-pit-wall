import { Router } from "express";
import fs from "fs";
import path from "path";
import axios from "axios";
import { fileURLToPath } from "url";
import { getLTASessionState, getLTATelemetry } from "../lib/ltaStore.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_DIR = path.join(__dirname, "../cache/lta");

const router = Router();
const LTA_BASE = "https://livetiming.formula1.com/static";

// Check if a session's primary files are downloaded locally
function checkCacheStatus(key) {
  const timingFile = path.join(CACHE_DIR, `${key}_TimingData.jsonStream`);
  const carDataFile = path.join(CACHE_DIR, `${key}_CarData.z.jsonStream`);
  return {
    timingDownloaded: fs.existsSync(timingFile),
    telemetryDownloaded: fs.existsSync(carDataFile),
  };
}

router.get("/meetings/:year", async (req, res, next) => {
  try {
    const { year } = req.params;
    const indexUrl = `${LTA_BASE}/${year}/Index.json`;
    const cacheFile = path.join(CACHE_DIR, `index_${year}.json`);

    let indexText;
    if (fs.existsSync(cacheFile)) {
      indexText = fs.readFileSync(cacheFile, "utf8");
    } else {
      console.log(`[LTA Route] Downloading index for year ${year}`);
      const resp = await axios.get(indexUrl, {
        headers: { "User-Agent": "BestHTTP" },
      });
      indexText = JSON.stringify(resp.data);
      fs.writeFileSync(cacheFile, indexText, "utf8");
    }

    const index = JSON.parse(indexText);
    const meetings = (index.Meetings || []).map((m) => {
      const sessions = (m.Sessions || []).map((s) => {
        const cache = checkCacheStatus(s.Key);
        return {
          key: s.Key,
          name: s.Name,
          type: s.Type,
          startDate: s.StartDate,
          path: s.Path,
          downloaded: cache.timingDownloaded,
          telemetryDownloaded: cache.telemetryDownloaded,
        };
      });

      return {
        key: m.Key,
        name: m.Name,
        officialName: m.OfficialName,
        location: m.Location,
        country: m.Country?.Name || "",
        sessions,
      };
    });

    res.json({ year: parseInt(year), meetings });
  } catch (err) {
    next(err);
  }
});

// Explicit download endpoint to download and keep all data (including raw telemetry) locally
router.get("/download/:key", async (req, res, next) => {
  try {
    const { key } = req.params;
    console.log(`[LTA Route] Triggering full download & cache for session ${key}...`);

    // 1. Download core session files (TimingData, Weather, etc.)
    await getLTASessionState(key);

    // 2. Download high-frequency CarData telemetry stream file explicitly
    // This calls getLTATelemetry(key, 'all') or just pulls the file directly if we pass any driver.
    // To ensure the file is downloaded, we fetch the CarData.z.jsonStream directly!
    // Since getLTATelemetry already pulls and saves the whole file, querying any driver number (e.g. 1) does this!
    await getLTATelemetry(key, 1);

    const cache = checkCacheStatus(key);
    res.json({
      success: true,
      key: parseInt(key),
      timingDownloaded: cache.timingDownloaded,
      telemetryDownloaded: cache.telemetryDownloaded,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
