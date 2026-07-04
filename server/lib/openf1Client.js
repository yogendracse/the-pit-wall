const BASE_URL = "https://api.openf1.org/v1";

const CACHE_TTL_MS = 15_000;
const MAX_PER_SECOND = 3;
const MAX_PER_MINUTE = 30;

const cache = new Map(); // key -> { data, expiresAt }
const requestTimestamps = []; // ms epoch, pruned as we go

function pruneTimestamps(now) {
  while (requestTimestamps.length && now - requestTimestamps[0] > 60_000) {
    requestTimestamps.shift();
  }
}

function nextSlotDelay(now) {
  pruneTimestamps(now);
  const lastSecond = requestTimestamps.filter((t) => now - t < 1000);
  if (requestTimestamps.length >= MAX_PER_MINUTE) {
    return 60_000 - (now - requestTimestamps[0]) + 10;
  }
  if (lastSecond.length >= MAX_PER_SECOND) {
    return 1000 - (now - lastSecond[0]) + 10;
  }
  return 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttledFetch(url) {
  let delay = nextSlotDelay(Date.now());
  while (delay > 0) {
    await sleep(delay);
    delay = nextSlotDelay(Date.now());
  }
  requestTimestamps.push(Date.now());
  return fetch(url);
}

function buildUrl(path, params) {
  const parts = [];
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null) {
      if (key === "date_gte") {
        parts.push(`date>=${encodeURIComponent(value)}`);
      } else if (key === "date_lte") {
        parts.push(`date<=${encodeURIComponent(value)}`);
      } else {
        parts.push(`${key}=${encodeURIComponent(value)}`);
      }
    }
  }
  const query = parts.length ? `?${parts.join("&")}` : "";
  return `${BASE_URL}${path}${query}`;
}

/**
 * Cached, rate-limited fetch against OpenF1 free/historical tier.
 * Serves last-good cached data (stale-flagged) on upstream error or rate-limit.
 */
export async function openf1Get(path, params = {}, { ttlMs = CACHE_TTL_MS } = {}) {
  const url = buildUrl(path, params);
  console.log("Upstream Fetch URL:", url);
  const cached = cache.get(url);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return { data: cached.data, stale: false };
  }

  try {
    const res = await throttledFetch(url);
    if (!res.ok) throw new Error(`OpenF1 ${res.status} ${res.statusText}`);
    const data = await res.json();
    cache.set(url, { data, expiresAt: now + ttlMs });
    return { data, stale: false };
  } catch (err) {
    if (cached) {
      return { data: cached.data, stale: true, error: err.message };
    }
    throw err;
  }
}

export function cacheStats() {
  return { entries: cache.size, requestsInWindow: requestTimestamps.length };
}
