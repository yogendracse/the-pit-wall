// Default per-compound lap-time degradation, seconds lost per lap of tire age.
const DEFAULT_DEG_RATE = {
  SOFT: 0.12,
  MEDIUM: 0.085,
  HARD: 0.05,
  INTERMEDIATE: 0.1,
  WET: 0.08,
};

const DEFAULT_PIT_LOSS_SEC = 21.0;
const SC_PIT_LOSS_SEC = 12.5;

/**
 * Projected lap-time delta (seconds, relative to lap 0 pace) for staying out
 * vs pitting now, over `lapsRemaining` laps.
 */
export function projectDelta({
  tireAge,
  lapsRemaining,
  compound = "MEDIUM",
  newCompound = "SOFT",
  degRate,
  pitLossSec = DEFAULT_PIT_LOSS_SEC,
  underSafetyCar = false,
}) {
  const stayRate = degRate?.[compound] ?? DEFAULT_DEG_RATE[compound] ?? DEFAULT_DEG_RATE.MEDIUM;
  const pitRate = degRate?.[newCompound] ?? DEFAULT_DEG_RATE[newCompound] ?? DEFAULT_DEG_RATE.MEDIUM;
  const effectivePitLoss = underSafetyCar ? SC_PIT_LOSS_SEC : pitLossSec;

  const laps = [];
  for (let lap = 0; lap <= lapsRemaining; lap++) {
    const stayDelta = stayRate * (tireAge + lap) * (tireAge + lap) * 0.02 + stayRate * (tireAge + lap);
    const pitDelta = lap === 0 ? effectivePitLoss : effectivePitLoss + pitRate * lap;
    laps.push({ lap, stayDelta: round(stayDelta), pitDelta: round(pitDelta) });
  }
  return laps;
}

/**
 * Undercut/overcut estimate: will pitting now beat staying out against a
 * rival by X seconds after Y laps.
 */
export function undercutAnalysis({
  gapToRivalSec,
  tireAge,
  rivalTireAge,
  compound = "MEDIUM",
  newCompound = "SOFT",
  degRate,
  pitLossSec = DEFAULT_PIT_LOSS_SEC,
  lapsToEvaluate = 5,
  underSafetyCar = false,
}) {
  const stayRate = degRate?.[compound] ?? DEFAULT_DEG_RATE[compound] ?? DEFAULT_DEG_RATE.MEDIUM;
  const pitRate = degRate?.[newCompound] ?? DEFAULT_DEG_RATE[newCompound] ?? DEFAULT_DEG_RATE.MEDIUM;
  const effectivePitLoss = underSafetyCar ? SC_PIT_LOSS_SEC : pitLossSec;

  const results = [];
  for (let lap = 1; lap <= lapsToEvaluate; lap++) {
    // Us: pit now, run `lap` laps on new tires.
    const usTotal = effectivePitLoss + sumDeg(pitRate, 0, lap);
    // Rival: stays out, ages `lap` laps further on current tires.
    const rivalTotal = sumDeg(stayRate, rivalTireAge, rivalTireAge + lap);
    const netGapChange = rivalTotal - usTotal;
    const finalGap = gapToRivalSec + netGapChange;
    results.push({ lap, finalGap: round(finalGap), aheadOfRival: finalGap > 0 });
  }
  return results;
}

function sumDeg(rate, fromAge, toAge) {
  let total = 0;
  for (let age = fromAge; age < toAge; age++) total += rate * (age + 1);
  return total;
}

/**
 * Fit a rough per-lap degradation slope for a compound from actual lap times.
 * laps: [{ lapNumber, lapTimeSec, tireAge, compound }]
 */
export function fitDegradationSlope(laps, compound) {
  const points = laps
    .filter((l) => l.compound === compound && Number.isFinite(l.lapTimeSec))
    .map((l) => ({ x: l.tireAge, y: l.lapTimeSec }));
  if (points.length < 3) return null;

  const n = points.length;
  const sumX = points.reduce((a, p) => a + p.x, 0);
  const sumY = points.reduce((a, p) => a + p.y, 0);
  const sumXY = points.reduce((a, p) => a + p.x * p.y, 0);
  const sumXX = points.reduce((a, p) => a + p.x * p.x, 0);

  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;

  const slope = (n * sumXY - sumX * sumY) / denom;
  return round(slope, 4);
}

export function safetyCarWindow(raceControlMessages = []) {
  const active = raceControlMessages.find((m) =>
    /safety car|virtual safety car|vsc/i.test(m.message || "") && !/end|clear/i.test(m.message || "")
  );
  return active
    ? { active: true, message: active.message, adjustedPitLossSec: SC_PIT_LOSS_SEC }
    : { active: false };
}

function round(n, digits = 3) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export { DEFAULT_DEG_RATE, DEFAULT_PIT_LOSS_SEC, SC_PIT_LOSS_SEC };
