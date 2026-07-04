/**
 * ERS deploy/harvest/neutral proxy classifier.
 * NOT real battery telemetry — F1 never publishes ERS SoC or MGU-K/H wattage.
 * Heuristic only, from public car_data channels (throttle, speed, rpm, brake, drs, n_gear).
 *
 * sample: { date, throttle, brake, speed, rpm, n_gear, drs }
 */
const SPEED_RISE_THRESHOLD = 2; // km/h per sample, "rising speed"
const HIGH_THROTTLE = 90;
const LOW_THROTTLE = 20;

export function classifySamples(samples) {
  const sorted = [...samples].sort((a, b) => new Date(a.date) - new Date(b.date));

  return sorted.map((s, i) => {
    const prev = sorted[i - 1];
    const speedDelta = prev ? s.speed - prev.speed : 0;
    let zone = "neutral";

    if (s.brake > 0) {
      zone = "harvest"; // braking -> regen assumption
    } else if (s.throttle >= HIGH_THROTTLE && speedDelta >= SPEED_RISE_THRESHOLD) {
      zone = "deploy"; // full throttle + accelerating on a straight
    } else if (s.throttle <= LOW_THROTTLE && !s.brake) {
      zone = "harvest"; // lift-and-coast before a braking zone
    }

    return { ...s, speedDelta, zone };
  });
}

/**
 * Rough estimated battery-state proxy (0-100), NOT real SoC.
 * Increments on harvest zones, decrements on deploy zones, decayed toward 50 on neutral.
 * Purely relative/comparative — for showing "who is running leaner" between two drivers.
 */
export function estimateRelativeState(classifiedSamples, { start = 50, deployCost = 0.4, harvestGain = 0.3 } = {}) {
  let state = start;
  return classifiedSamples.map((s) => {
    if (s.zone === "deploy") state = Math.max(0, state - deployCost);
    else if (s.zone === "harvest") state = Math.min(100, state + harvestGain);
    return { ...s, estimatedState: Math.round(state * 10) / 10 };
  });
}

export function summarizeZones(classifiedSamples) {
  const counts = { deploy: 0, harvest: 0, neutral: 0 };
  for (const s of classifiedSamples) counts[s.zone] = (counts[s.zone] || 0) + 1;
  const total = classifiedSamples.length || 1;
  return {
    counts,
    pct: {
      deploy: round((counts.deploy / total) * 100),
      harvest: round((counts.harvest / total) * 100),
      neutral: round((counts.neutral / total) * 100),
    },
  };
}

function round(n) {
  return Math.round(n * 10) / 10;
}
