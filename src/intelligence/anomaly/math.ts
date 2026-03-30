/**
 * Module 2: Math/Anomaly Engine — Pure Math Functions
 *
 * All functions are pure (no side effects, no state).
 * No LLM. No I/O. Deterministic given the same inputs.
 *
 * Algorithms used:
 * - Welford's online algorithm for rolling mean/variance (numerically stable)
 * - Ordinary Least Squares (OLS) linear regression for trend detection
 * - Coefficient of determination (R²) for regression quality
 */

import type {
  DataPoint,
  RollingStats,
  BaselineSnapshot,
  TrendResult,
  TrendDirection,
  ConfidenceWeights,
  ConfidenceBreakdown,
} from './types';

// ── Welford's Online Algorithm ────────────────────────────────────────────────

/**
 * Initial (empty) rolling stats.
 */
export function emptyStats(): RollingStats {
  return { n: 0, mean: 0, m2: 0, min: Infinity, max: -Infinity };
}

/**
 * Return a new RollingStats updated with one new observation.
 * Uses Welford's algorithm for numerical stability.
 *
 * Immutable: does not modify the input.
 */
export function updateStats(stats: RollingStats, value: number): RollingStats {
  const n = stats.n + 1;
  const delta = value - stats.mean;
  const mean = stats.mean + delta / n;
  const delta2 = value - mean;
  const m2 = stats.m2 + delta * delta2;
  return {
    n,
    mean,
    m2,
    min: Math.min(stats.min, value),
    max: Math.max(stats.max, value),
  };
}

/**
 * Compute the population standard deviation from RollingStats.
 * Returns 0 if n < 2.
 *
 * We use population stddev (divide by n) because the baseline is treated
 * as the full observed population, not a sample from a larger population.
 */
export function stddev(stats: RollingStats): number {
  if (stats.n < 2) return 0;
  return Math.sqrt(stats.m2 / stats.n);
}

/**
 * Convert RollingStats to a BaselineSnapshot.
 */
export function toSnapshot(stats: RollingStats): BaselineSnapshot {
  return {
    mean: stats.mean,
    stddev: stddev(stats),
    min: stats.n === 0 ? 0 : stats.min,
    max: stats.n === 0 ? 0 : stats.max,
    sampleCount: stats.n,
  };
}

// ── Z-Score ───────────────────────────────────────────────────────────────────

/**
 * Compute the z-score of a value against a baseline.
 *
 * Returns NaN if stddev = 0 (all baseline values were identical).
 * Callers should treat NaN as "cannot score" (not an anomaly).
 */
export function computeZScore(value: number, mean: number, sd: number): number {
  if (sd === 0) return NaN;
  return (value - mean) / sd;
}

/**
 * True if the absolute z-score exceeds the threshold.
 * NaN z-scores are never anomalies.
 */
export function isZScoreAnomaly(zScore: number, threshold: number): boolean {
  if (!Number.isFinite(zScore)) return false;
  return Math.abs(zScore) > threshold;
}

/**
 * Direction of deviation.
 */
export function anomalyDirection(zScore: number): 'high' | 'low' | 'none' {
  if (!Number.isFinite(zScore) || zScore === 0) return 'none';
  return zScore > 0 ? 'high' : 'low';
}

// ── Linear Regression (OLS) ───────────────────────────────────────────────────

/**
 * Ordinary Least Squares linear regression: y = slope * x + intercept.
 *
 * Returns slope=0, intercept=0, r2=0 for < 2 points.
 * Uses the numerically stable two-pass algorithm.
 */
export function linearRegression(points: DataPoint[]): {
  slope: number;
  intercept: number;
} {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: 0 };

  let sumX = 0, sumY = 0;
  for (const p of points) { sumX += p.x; sumY += p.y; }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let ssXX = 0, ssXY = 0;
  for (const p of points) {
    const dx = p.x - meanX;
    ssXX += dx * dx;
    ssXY += dx * (p.y - meanY);
  }

  if (ssXX === 0) return { slope: 0, intercept: meanY };

  const slope = ssXY / ssXX;
  const intercept = meanY - slope * meanX;
  return { slope, intercept };
}

/**
 * Compute R² (coefficient of determination) for a regression line.
 *
 * R² = 1 - SS_res / SS_tot
 * Returns 0 if SS_tot = 0 (all y values are identical).
 * Clamps result to [0, 1] to handle floating-point edge cases.
 */
export function rSquared(
  points: DataPoint[],
  slope: number,
  intercept: number,
): number {
  const n = points.length;
  if (n < 2) return 0;

  let sumY = 0;
  for (const p of points) sumY += p.y;
  const meanY = sumY / n;

  let ssTot = 0, ssRes = 0;
  for (const p of points) {
    const diff = p.y - meanY;
    ssTot += diff * diff;
    const predicted = slope * p.x + intercept;
    const res = p.y - predicted;
    ssRes += res * res;
  }

  if (ssTot === 0) return 0;
  return Math.max(0, Math.min(1, 1 - ssRes / ssTot));
}

/**
 * Build a TrendResult from a series of data points.
 *
 * @param points        - time-ordered (x = seconds offset, y = metric value)
 * @param noiseFloor    - fraction of mean below which slope is treated as flat
 *                        (e.g., 0.05 = 5% of mean per second)
 */
export function detectTrend(
  points: DataPoint[],
  noiseFloor: number,
): TrendResult {
  const n = points.length;
  if (n < 2) {
    return {
      slope: 0,
      intercept: n === 1 ? points[0]!.y : 0,
      r2: 0,
      direction: 'flat',
      sampleCount: n,
    };
  }

  const { slope, intercept } = linearRegression(points);
  const r2 = rSquared(points, slope, intercept);

  // Compute mean y to normalise the noise floor
  let sumY = 0;
  for (const p of points) sumY += p.y;
  const meanY = sumY / n;

  // Treat as flat if mean is 0 or slope is within the noise band
  const threshold = Math.abs(meanY) * noiseFloor;
  let direction: TrendDirection;
  if (meanY === 0 || Math.abs(slope) <= threshold) {
    direction = 'flat';
  } else {
    direction = slope > 0 ? 'rising' : 'falling';
  }

  return { slope, intercept, r2, direction, sampleCount: n };
}

// ── Confidence Scoring ────────────────────────────────────────────────────────

/**
 * Compute a [0, 1] score for sample volume.
 * Score saturates at 1.0 when sampleCount >= saturationPoint.
 *
 * Uses sqrt for sub-linear growth (diminishing returns on more samples).
 */
export function sampleVolumeScore(
  sampleCount: number,
  saturationPoint: number,
): number {
  if (saturationPoint <= 0 || sampleCount <= 0) return 0;
  return Math.min(1, Math.sqrt(sampleCount / saturationPoint));
}

/**
 * Compute a [0, 1] score for baseline stability.
 * A stable baseline (low coefficient of variation) scores higher.
 *
 * coefficient of variation (CV) = stddev / mean
 * score = max(0, 1 - CV)  — capped to [0, 1]
 *
 * Stable (CV near 0) → score near 1.0
 * Volatile (CV near 1) → score near 0.0
 */
export function baselineStabilityScore(mean: number, sd: number): number {
  if (mean === 0) return sd === 0 ? 1 : 0;
  const cv = Math.abs(sd / mean);
  return Math.max(0, 1 - cv);
}

/**
 * Compute a [0, 1] score for signal agreement.
 * Both z-score and trend should point in the same direction.
 *
 * Agreement matrix:
 * - z-score high + trend rising  → 1.0
 * - z-score low  + trend falling → 1.0
 * - z-score none + trend flat    → 0.5 (neutral, neither confirms nor denies)
 * - contradictory (high + falling, low + rising) → 0.0
 * - mixed (only one signal present)              → 0.5
 */
export function signalAgreementScore(
  zDirection: 'high' | 'low' | 'none',
  trendDirection: TrendDirection,
): number {
  if (zDirection === 'none' && trendDirection === 'flat') return 0.5;
  if (zDirection === 'high' && trendDirection === 'rising') return 1.0;
  if (zDirection === 'low' && trendDirection === 'falling') return 1.0;
  if (
    (zDirection === 'high' && trendDirection === 'falling') ||
    (zDirection === 'low' && trendDirection === 'rising')
  ) {
    return 0.0;
  }
  // One signal is neutral (flat or none) and the other is not
  return 0.5;
}

/**
 * Combine component scores into a final confidence value.
 *
 * Weights are normalised to sum to 1.0 before application.
 * Returns 0 if all weights sum to 0.
 */
export function computeConfidence(
  sampleVol: number,
  baselineStab: number,
  signalAgree: number,
  weights: ConfidenceWeights,
): ConfidenceBreakdown {
  const wSum =
    weights.sampleVolume + weights.baselineStability + weights.signalAgreement;

  if (wSum === 0) {
    return {
      sampleVolumeScore: sampleVol,
      baselineStabilityScore: baselineStab,
      signalAgreementScore: signalAgree,
      confidence: 0,
    };
  }

  const w1 = weights.sampleVolume / wSum;
  const w2 = weights.baselineStability / wSum;
  const w3 = weights.signalAgreement / wSum;

  const confidence = w1 * sampleVol + w2 * baselineStab + w3 * signalAgree;

  return {
    sampleVolumeScore: sampleVol,
    baselineStabilityScore: baselineStab,
    signalAgreementScore: signalAgree,
    confidence: Math.max(0, Math.min(1, confidence)),
  };
}
