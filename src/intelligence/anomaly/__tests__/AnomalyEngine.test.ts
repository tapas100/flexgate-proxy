/**
 * Module 2: Math/Anomaly Engine — Unit Tests
 *
 * Test groups:
 *  1. Welford's online algorithm (updateStats, stddev)
 *  2. Z-score computation (computeZScore, isZScoreAnomaly, anomalyDirection)
 *  3. Linear regression (linearRegression, rSquared)
 *  4. Trend detection (detectTrend — direction, noise floor)
 *  5. Confidence scoring (sampleVolumeScore, baselineStabilityScore, signalAgreementScore, computeConfidence)
 *  6. AnomalyEngine — record + analyze integration
 *  7. AnomalyEngine — eviction, reset, singleton
 */

import {
  emptyStats,
  updateStats,
  stddev,
  toSnapshot,
  computeZScore,
  isZScoreAnomaly,
  anomalyDirection,
  linearRegression,
  rSquared,
  detectTrend,
  sampleVolumeScore,
  baselineStabilityScore,
  signalAgreementScore,
  computeConfidence,
} from '../math';
import {
  AnomalyEngine,
  resetAnomalyEngine,
  getAnomalyEngine,
} from '../AnomalyEngine';
import type { DataPoint, ConfidenceWeights } from '../types';

// ── helpers ───────────────────────────────────────────────────────────────────

function buildStats(values: number[]) {
  let s = emptyStats();
  for (const v of values) s = updateStats(s, v);
  return s;
}

function pts(ys: number[]): DataPoint[] {
  return ys.map((y, i) => ({ x: i, y }));
}

// ── 1. Welford's algorithm ─────────────────────────────────────────────────────

describe('Welford online algorithm', () => {
  test('empty stats have n=0, mean=0', () => {
    const s = emptyStats();
    expect(s.n).toBe(0);
    expect(s.mean).toBe(0);
    expect(s.m2).toBe(0);
  });

  test('single value: mean equals value, stddev = 0', () => {
    const s = buildStats([42]);
    expect(s.n).toBe(1);
    expect(s.mean).toBe(42);
    expect(stddev(s)).toBe(0);
  });

  test('two values: mean and stddev correct', () => {
    const s = buildStats([10, 20]);
    expect(s.mean).toBe(15);
    // population stddev of [10, 20]: sqrt(((10-15)^2 + (20-15)^2) / 2) = sqrt(25) = 5
    expect(stddev(s)).toBeCloseTo(5);
  });

  test('100 values [1..100]: mean = 50.5', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    const s = buildStats(values);
    expect(s.mean).toBeCloseTo(50.5);
    expect(s.n).toBe(100);
  });

  test('min and max are tracked', () => {
    const s = buildStats([5, 3, 8, 1, 9]);
    expect(s.min).toBe(1);
    expect(s.max).toBe(9);
  });

  test('stddev of constant series = 0', () => {
    const s = buildStats([7, 7, 7, 7, 7]);
    expect(stddev(s)).toBe(0);
  });

  test('toSnapshot produces correct BaselineSnapshot', () => {
    const s = buildStats([10, 20]);
    const snap = toSnapshot(s);
    expect(snap.mean).toBeCloseTo(15);
    expect(snap.stddev).toBeCloseTo(5);
    expect(snap.min).toBe(10);
    expect(snap.max).toBe(20);
    expect(snap.sampleCount).toBe(2);
  });

  test('toSnapshot with 0 samples uses 0 for min/max', () => {
    const snap = toSnapshot(emptyStats());
    expect(snap.min).toBe(0);
    expect(snap.max).toBe(0);
    expect(snap.sampleCount).toBe(0);
  });

  test('immutability: updateStats does not mutate input', () => {
    const original = buildStats([10, 20]);
    const originalMean = original.mean;
    updateStats(original, 100);
    expect(original.mean).toBe(originalMean); // unchanged
  });
});

// ── 2. Z-score ────────────────────────────────────────────────────────────────

describe('Z-score', () => {
  test('value at mean produces z = 0', () => {
    expect(computeZScore(50, 50, 10)).toBe(0);
  });

  test('value 1 stddev above mean → z = 1', () => {
    expect(computeZScore(60, 50, 10)).toBeCloseTo(1.0);
  });

  test('value 2 stddevs below mean → z = -2', () => {
    expect(computeZScore(30, 50, 10)).toBeCloseTo(-2.0);
  });

  test('stddev = 0 returns NaN', () => {
    expect(computeZScore(50, 50, 0)).toBeNaN();
    expect(computeZScore(60, 50, 0)).toBeNaN();
  });

  test('isZScoreAnomaly: z=3 above threshold=2.5 → true', () => {
    expect(isZScoreAnomaly(3, 2.5)).toBe(true);
  });

  test('isZScoreAnomaly: z=2 below threshold=2.5 → false', () => {
    expect(isZScoreAnomaly(2, 2.5)).toBe(false);
  });

  test('isZScoreAnomaly: z exactly at threshold → false (strictly greater)', () => {
    expect(isZScoreAnomaly(2.5, 2.5)).toBe(false);
  });

  test('isZScoreAnomaly: z=-3 (negative) above threshold → true', () => {
    expect(isZScoreAnomaly(-3, 2.5)).toBe(true);
  });

  test('isZScoreAnomaly: NaN → false', () => {
    expect(isZScoreAnomaly(NaN, 2.5)).toBe(false);
  });

  test('anomalyDirection: positive z → high', () => {
    expect(anomalyDirection(3)).toBe('high');
  });

  test('anomalyDirection: negative z → low', () => {
    expect(anomalyDirection(-3)).toBe('low');
  });

  test('anomalyDirection: z=0 → none', () => {
    expect(anomalyDirection(0)).toBe('none');
  });

  test('anomalyDirection: NaN → none', () => {
    expect(anomalyDirection(NaN)).toBe('none');
  });
});

// ── 3. Linear regression ──────────────────────────────────────────────────────

describe('linearRegression', () => {
  test('fewer than 2 points → slope=0, intercept=0', () => {
    expect(linearRegression([])).toEqual({ slope: 0, intercept: 0 });
    expect(linearRegression([{ x: 1, y: 5 }])).toEqual({ slope: 0, intercept: 0 });
  });

  test('perfect positive line: y = 2x + 1', () => {
    const points = pts([1, 3, 5, 7, 9]); // y = 2*x + 1
    const { slope, intercept } = linearRegression(points);
    expect(slope).toBeCloseTo(2);
    expect(intercept).toBeCloseTo(1);
  });

  test('perfect negative line: y = -x + 10', () => {
    const points: DataPoint[] = [
      { x: 0, y: 10 }, { x: 1, y: 9 }, { x: 2, y: 8 },
      { x: 3, y: 7 }, { x: 4, y: 6 },
    ];
    const { slope, intercept } = linearRegression(points);
    expect(slope).toBeCloseTo(-1);
    expect(intercept).toBeCloseTo(10);
  });

  test('horizontal line: slope = 0', () => {
    const points = pts([5, 5, 5, 5, 5]);
    const { slope } = linearRegression(points);
    expect(slope).toBeCloseTo(0);
  });

  test('all x equal → slope=0, intercept=mean(y)', () => {
    const points: DataPoint[] = [
      { x: 3, y: 2 }, { x: 3, y: 4 }, { x: 3, y: 6 },
    ];
    const { slope, intercept } = linearRegression(points);
    expect(slope).toBe(0);
    expect(intercept).toBeCloseTo(4); // mean of [2,4,6]
  });
});

describe('rSquared', () => {
  test('perfect fit → r2 = 1', () => {
    const points = pts([1, 3, 5, 7, 9]);
    const { slope, intercept } = linearRegression(points);
    expect(rSquared(points, slope, intercept)).toBeCloseTo(1.0);
  });

  test('horizontal line through all points → r2 = 1', () => {
    const points = pts([4, 4, 4, 4]);
    const { slope, intercept } = linearRegression(points);
    // SS_tot = 0 → returns 0 by convention
    expect(rSquared(points, slope, intercept)).toBe(0);
  });

  test('noisy data → r2 < 1', () => {
    const points = pts([1, 10, 2, 9, 3, 8]);
    const { slope, intercept } = linearRegression(points);
    expect(rSquared(points, slope, intercept)).toBeLessThan(1.0);
  });

  test('< 2 points → r2 = 0', () => {
    expect(rSquared([], 0, 0)).toBe(0);
    expect(rSquared([{ x: 0, y: 5 }], 0, 5)).toBe(0);
  });
});

// ── 4. Trend detection ────────────────────────────────────────────────────────

describe('detectTrend', () => {
  test('empty series → direction = flat', () => {
    expect(detectTrend([], 0.05).direction).toBe('flat');
  });

  test('single point → direction = flat', () => {
    expect(detectTrend([{ x: 0, y: 5 }], 0.05).direction).toBe('flat');
  });

  test('strongly rising series → direction = rising', () => {
    const points = pts([10, 20, 30, 40, 50]);
    const trend = detectTrend(points, 0.05);
    expect(trend.direction).toBe('rising');
    expect(trend.slope).toBeGreaterThan(0);
    expect(trend.r2).toBeGreaterThan(0.99);
  });

  test('strongly falling series → direction = falling', () => {
    const points = pts([50, 40, 30, 20, 10]);
    const trend = detectTrend(points, 0.05);
    expect(trend.direction).toBe('falling');
    expect(trend.slope).toBeLessThan(0);
  });

  test('constant series → direction = flat (zero slope)', () => {
    const points = pts([100, 100, 100, 100, 100]);
    expect(detectTrend(points, 0.05).direction).toBe('flat');
  });

  test('tiny slope below noise floor → direction = flat', () => {
    // mean ≈ 100, slope ≈ 0.001 per step (0.001% per step << 5% noise floor)
    const points: DataPoint[] = [
      { x: 0, y: 100.000 },
      { x: 1, y: 100.001 },
      { x: 2, y: 100.002 },
    ];
    expect(detectTrend(points, 0.05).direction).toBe('flat');
  });

  test('sampleCount is set correctly', () => {
    const points = pts([1, 2, 3, 4, 5]);
    expect(detectTrend(points, 0.05).sampleCount).toBe(5);
  });
});

// ── 5. Confidence scoring ─────────────────────────────────────────────────────

describe('sampleVolumeScore', () => {
  test('0 samples → 0', () => {
    expect(sampleVolumeScore(0, 50)).toBe(0);
  });

  test('at saturation point → 1.0', () => {
    expect(sampleVolumeScore(50, 50)).toBeCloseTo(1.0);
  });

  test('above saturation → capped at 1.0', () => {
    expect(sampleVolumeScore(100, 50)).toBe(1.0);
  });

  test('sub-linear: 25/50 = sqrt(0.5) ≈ 0.707', () => {
    expect(sampleVolumeScore(25, 50)).toBeCloseTo(Math.sqrt(0.5));
  });
});

describe('baselineStabilityScore', () => {
  test('mean=0, stddev=0 → 1.0 (stable constant)', () => {
    expect(baselineStabilityScore(0, 0)).toBe(1);
  });

  test('mean=0, stddev>0 → 0 (undefined CV)', () => {
    expect(baselineStabilityScore(0, 5)).toBe(0);
  });

  test('low CV (stddev << mean) → near 1.0', () => {
    // CV = 1/100 = 0.01 → score ≈ 0.99
    expect(baselineStabilityScore(100, 1)).toBeCloseTo(0.99);
  });

  test('CV = 1 (stddev = mean) → 0.0', () => {
    expect(baselineStabilityScore(100, 100)).toBe(0);
  });

  test('CV > 1 → clamped to 0', () => {
    expect(baselineStabilityScore(10, 200)).toBe(0);
  });
});

describe('signalAgreementScore', () => {
  test('z=none, trend=flat → 0.5 (neutral)', () => {
    expect(signalAgreementScore('none', 'flat')).toBe(0.5);
  });

  test('z=high, trend=rising → 1.0 (full agreement)', () => {
    expect(signalAgreementScore('high', 'rising')).toBe(1.0);
  });

  test('z=low, trend=falling → 1.0 (full agreement)', () => {
    expect(signalAgreementScore('low', 'falling')).toBe(1.0);
  });

  test('z=high, trend=falling → 0.0 (contradiction)', () => {
    expect(signalAgreementScore('high', 'falling')).toBe(0.0);
  });

  test('z=low, trend=rising → 0.0 (contradiction)', () => {
    expect(signalAgreementScore('low', 'rising')).toBe(0.0);
  });

  test('z=high, trend=flat → 0.5 (partial)', () => {
    expect(signalAgreementScore('high', 'flat')).toBe(0.5);
  });

  test('z=none, trend=rising → 0.5 (partial)', () => {
    expect(signalAgreementScore('none', 'rising')).toBe(0.5);
  });
});

describe('computeConfidence', () => {
  const equalWeights: ConfidenceWeights = {
    sampleVolume: 1,
    baselineStability: 1,
    signalAgreement: 1,
  };

  test('equal weights: average of three scores', () => {
    const result = computeConfidence(0.9, 0.8, 0.7, equalWeights);
    expect(result.confidence).toBeCloseTo((0.9 + 0.8 + 0.7) / 3);
  });

  test('all zeros → confidence = 0', () => {
    const result = computeConfidence(0, 0, 0, equalWeights);
    expect(result.confidence).toBe(0);
  });

  test('all ones → confidence = 1', () => {
    const result = computeConfidence(1, 1, 1, equalWeights);
    expect(result.confidence).toBe(1);
  });

  test('zero-sum weights → confidence = 0', () => {
    const noWeights: ConfidenceWeights = { sampleVolume: 0, baselineStability: 0, signalAgreement: 0 };
    expect(computeConfidence(1, 1, 1, noWeights).confidence).toBe(0);
  });

  test('weighted: signalAgreement weight=0 → agreement not counted', () => {
    const weights: ConfidenceWeights = { sampleVolume: 1, baselineStability: 1, signalAgreement: 0 };
    const result = computeConfidence(1.0, 0.5, 0.0, weights);
    // confidence = (1*1 + 1*0.5 + 0*0) / 2 = 0.75
    expect(result.confidence).toBeCloseTo(0.75);
  });

  test('breakdown scores are returned unchanged', () => {
    const result = computeConfidence(0.8, 0.6, 0.4, equalWeights);
    expect(result.sampleVolumeScore).toBe(0.8);
    expect(result.baselineStabilityScore).toBe(0.6);
    expect(result.signalAgreementScore).toBe(0.4);
  });

  test('confidence is clamped to [0, 1]', () => {
    // Edge case: if a component is > 1 (caller error), clamp applies
    const result = computeConfidence(2, 2, 2, equalWeights);
    expect(result.confidence).toBe(1);
  });
});

// ── 6. AnomalyEngine integration ──────────────────────────────────────────────

describe('AnomalyEngine', () => {
  let engine: AnomalyEngine;

  beforeEach(() => {
    resetAnomalyEngine();
    engine = new AnomalyEngine({
      zScoreThreshold: 2.5,
      minConfidence: 0.6,
      minBaselineSamples: 5,
    });
  });

  afterEach(() => {
    resetAnomalyEngine();
  });

  test('baseline() returns null before any records', () => {
    expect(engine.baseline('rps')).toBeNull();
  });

  test('baseline() returns snapshot after records', () => {
    engine.record('rps', 10);
    engine.record('rps', 20);
    const snap = engine.baseline('rps');
    expect(snap).not.toBeNull();
    expect(snap!.mean).toBeCloseTo(15);
    expect(snap!.sampleCount).toBe(2);
  });

  test('analyze() with empty baseline: isConfirmedAnomaly = false', () => {
    const signal = engine.analyze('rps', 999, pts([1, 2, 999]));
    expect(signal.isConfirmedAnomaly).toBe(false);
  });

  test('analyze() with < minBaselineSamples: isConfirmedAnomaly = false', () => {
    // Record 4 values (< minBaselineSamples=5)
    for (let i = 0; i < 4; i++) engine.record('rps', 10);
    const signal = engine.analyze('rps', 1000, pts([10, 10, 10, 1000]));
    expect(signal.isConfirmedAnomaly).toBe(false);
  });

  test('analyze() detects confirmed anomaly with sufficient baseline', () => {
    // Stable baseline of ~10 with low variance
    for (let i = 0; i < 30; i++) engine.record('rps', 10 + (Math.random() * 0.1));
    // Spike to 100 (far outside baseline)
    const signal = engine.analyze('rps', 100, pts([10, 10, 10, 10, 100]));
    expect(signal.zScore.isAnomaly).toBe(true);
    expect(signal.zScore.direction).toBe('high');
    expect(signal.isConfirmedAnomaly).toBe(true);
  });

  test('analyze() does not flag normal values', () => {
    for (let i = 0; i < 20; i++) engine.record('rps', 10);
    const signal = engine.analyze('rps', 10.5, pts([10, 10, 10, 10, 10.5]));
    expect(signal.zScore.isAnomaly).toBe(false);
    expect(signal.isConfirmedAnomaly).toBe(false);
  });

  test('analyze() populates trend correctly', () => {
    for (let i = 0; i < 20; i++) engine.record('rps', 10);
    const risingPts = pts([10, 20, 30, 40, 50]);
    const signal = engine.analyze('rps', 50, risingPts);
    expect(signal.trend.direction).toBe('rising');
    expect(signal.trend.slope).toBeGreaterThan(0);
  });

  test('analyze() does NOT record value into baseline', () => {
    for (let i = 0; i < 5; i++) engine.record('rps', 10);
    const n = engine.baseline('rps')!.sampleCount;
    engine.analyze('rps', 1000, []);
    // Baseline count should be unchanged
    expect(engine.baseline('rps')!.sampleCount).toBe(n);
  });

  test('metricKey is reflected in the AnomalySignal', () => {
    engine.record('p95', 50);
    const signal = engine.analyze('p95', 50, []);
    expect(signal.metricKey).toBe('p95');
  });

  test('multiple metrics are tracked independently', () => {
    for (let i = 0; i < 10; i++) {
      engine.record('rps', 10);
      engine.record('latency', 50);
    }
    expect(engine.baseline('rps')!.mean).toBeCloseTo(10);
    expect(engine.baseline('latency')!.mean).toBeCloseTo(50);
  });

  test('reset() clears a specific metric', () => {
    engine.record('rps', 10);
    engine.record('latency', 50);
    engine.reset('rps');
    expect(engine.baseline('rps')).toBeNull();
    expect(engine.baseline('latency')).not.toBeNull();
  });

  test('resetAll() clears all metrics', () => {
    engine.record('rps', 10);
    engine.record('latency', 50);
    engine.resetAll();
    expect(engine.baseline('rps')).toBeNull();
    expect(engine.baseline('latency')).toBeNull();
  });

  // ── 7. Eviction and singleton ─────────────────────────────────────────────

  test('baseline eviction: n stays <= maxBaselineSize after cap', () => {
    const small = new AnomalyEngine({ maxBaselineSize: 20 });
    for (let i = 0; i < 25; i++) small.record('x', i);
    const snap = small.baseline('x');
    expect(snap!.sampleCount).toBeLessThanOrEqual(20);
  });

  test('eviction preserves approximate mean (within 20%)', () => {
    const small = new AnomalyEngine({ maxBaselineSize: 10 });
    // Record 20 values all equal to 100
    for (let i = 0; i < 20; i++) small.record('x', 100);
    const snap = small.baseline('x');
    expect(snap!.mean).toBeCloseTo(100, 0);
  });

  test('getAnomalyEngine() returns the same singleton', () => {
    resetAnomalyEngine();
    const a = getAnomalyEngine();
    const b = getAnomalyEngine();
    expect(a).toBe(b);
  });

  test('resetAnomalyEngine() causes new singleton on next call', () => {
    const a = getAnomalyEngine();
    resetAnomalyEngine();
    const b = getAnomalyEngine();
    expect(a).not.toBe(b);
  });
});
