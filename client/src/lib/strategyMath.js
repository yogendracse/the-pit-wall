// Client-side mirror of server/lib/strategySim.js so sliders recompute
// instantly with no network round-trip (see REQUIREMENTS.md 5.2).
const DEFAULT_DEG_RATE = {
  SOFT: 0.12,
  MEDIUM: 0.085,
  HARD: 0.05,
  INTERMEDIATE: 0.1,
  WET: 0.08,
};

const DEFAULT_PIT_LOSS_SEC = 21.0;
const SC_PIT_LOSS_SEC = 12.5;

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

export function undercutAnalysis({
  gapToRivalSec,
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
    const usTotal = effectivePitLoss + sumDeg(pitRate, 0, lap);
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

function round(n, digits = 3) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export { DEFAULT_DEG_RATE, DEFAULT_PIT_LOSS_SEC, SC_PIT_LOSS_SEC };
