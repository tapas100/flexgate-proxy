// Copyright (c) 2026 Tapas Adhikary. All rights reserved.
// This file is part of the FlexGate Runtime Intelligence Layer.
// Licensed under the Business Source License 1.1 (BUSL-1.1).
// See LICENSE in the project root for full terms.
// Commercial use requires a separate license. Change Date: 2030-04-06.

/**
 * Module 2: AnomalyEngine
 *
 * Stateful engine that maintains a rolling baseline per metric key and exposes
 * anomaly analysis on demand. All analysis logic is delegated to pure functions
 * in math.ts — the engine only manages state.
 *
 * Thread safety: Node.js is single-threaded; no locking needed.
 *
 * Memory model:
 *   One RollingStats per tracked metric key.
 *   Rolling baseline is capped at maxBaselineSize via reservoir eviction
 *   (oldest half dropped when cap is reached).
 *
 * Usage:
 *   const engine = getAnomalyEngine();
 *   engine.record('rps', currentRps);         // feed baseline
 *   const signal = engine.analyze('rps', currentRps, recentSeries);
 */

import type {
  AnomalyEngineConfig,
  AnomalySignal,
  BaselineSnapshot,
  DataPoint,
  IAnomalyEngine,
  ZScoreResult,
} from './types';
import type { RollingStats } from './types';
import {
  emptyStats,
  updateStats,
  toSnapshot,
  computeZScore,
  isZScoreAnomaly,
  anomalyDirection,
  detectTrend,
  sampleVolumeScore,
  baselineStabilityScore,
  signalAgreementScore,
  computeConfidence,
} from './math';

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: AnomalyEngineConfig = {
  zScoreThreshold: 2.5,
  minConfidence: 0.6,
  minBaselineSamples: 10,
  maxBaselineSize: 1000,
  trendNoiseFloor: 0.05,
  confidenceWeights: {
    sampleVolume: 1,
    baselineStability: 1,
    signalAgreement: 1,
  },
};

// ── Internal State ────────────────────────────────────────────────────────────

/** Internal per-metric state. */
interface MetricState {
  stats: RollingStats;
  /** Count of total observations seen (before any eviction) */
  totalSeen: number;
}

// ── Engine ────────────────────────────────────────────────────────────────────

export class AnomalyEngine implements IAnomalyEngine {
  private readonly cfg: AnomalyEngineConfig;
  private readonly metrics: Map<string, MetricState> = new Map();

  constructor(config: Partial<AnomalyEngineConfig> = {}) {
    this.cfg = {
      ...DEFAULT_CONFIG,
      ...config,
      confidenceWeights: {
        ...DEFAULT_CONFIG.confidenceWeights,
        ...(config.confidenceWeights ?? {}),
      },
    };
  }

  // ── IAnomalyEngine ─────────────────────────────────────────────────────────

  /**
   * Record a new observation into the rolling baseline.
   *
   * When the baseline reaches maxBaselineSize, we discard the oldest half
   * by rebuilding stats from just the newer half (approximation — acceptable
   * for anomaly detection where recent behaviour is more relevant).
   */
  record(metricKey: string, value: number): void {
    const state = this.getOrCreate(metricKey);
    state.totalSeen += 1;
    state.stats = updateStats(state.stats, value);

    // Evict oldest half when cap is reached
    if (state.stats.n >= this.cfg.maxBaselineSize) {
      this.evictHalf(state);
    }
  }

  /**
   * Analyse the current value against the stored baseline and recent series.
   * Does NOT modify the baseline (call record() separately).
   */
  analyze(
    metricKey: string,
    currentValue: number,
    series: DataPoint[],
  ): AnomalySignal {
    const now = Date.now();
    const state = this.metrics.get(metricKey);
    const snap: BaselineSnapshot = state
      ? toSnapshot(state.stats)
      : { mean: 0, stddev: 0, min: 0, max: 0, sampleCount: 0 };

    // ── Z-score ──
    const z = computeZScore(currentValue, snap.mean, snap.stddev);
    const hasEnoughBaseline = snap.sampleCount >= this.cfg.minBaselineSamples;
    const zAnomalous = hasEnoughBaseline && isZScoreAnomaly(z, this.cfg.zScoreThreshold);
    const zDir = zAnomalous ? anomalyDirection(z) : 'none';

    const zScoreResult: ZScoreResult = {
      value: currentValue,
      zScore: Number.isFinite(z) ? z : 0,
      isAnomaly: zAnomalous,
      direction: zDir,
      baseline: snap,
    };

    // ── Trend ──
    const trend = detectTrend(series, this.cfg.trendNoiseFloor);

    // ── Confidence ──
    const saturation = this.cfg.minBaselineSamples * 5; // saturate at 5× minimum
    const volScore = sampleVolumeScore(snap.sampleCount, saturation);
    const stabScore = baselineStabilityScore(snap.mean, snap.stddev);
    const agreeScore = signalAgreementScore(zDir, trend.direction);

    const confidence = computeConfidence(
      volScore,
      stabScore,
      agreeScore,
      this.cfg.confidenceWeights,
    );

    // ── Verdict ──
    const isConfirmedAnomaly =
      hasEnoughBaseline &&
      zAnomalous &&
      confidence.confidence >= this.cfg.minConfidence;

    return {
      metricKey,
      computedAtMs: now,
      zScore: zScoreResult,
      trend,
      confidence,
      isConfirmedAnomaly,
    };
  }

  baseline(metricKey: string): BaselineSnapshot | null {
    const state = this.metrics.get(metricKey);
    if (!state || state.stats.n === 0) return null;
    return toSnapshot(state.stats);
  }

  reset(metricKey: string): void {
    this.metrics.delete(metricKey);
  }

  resetAll(): void {
    this.metrics.clear();
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private getOrCreate(key: string): MetricState {
    let s = this.metrics.get(key);
    if (!s) {
      s = { stats: emptyStats(), totalSeen: 0 };
      this.metrics.set(key, s);
    }
    return s;
  }

  /**
   * Approximate eviction: reset stats to stats of just the second half of
   * observations. Since we don't store individual values, we approximate by
   * splitting Welford's stats: carry forward n/2 observations starting from
   * the current mean (stable approximation for large n).
   *
   * Accuracy note: This is an approximation. For production use cases that
   * require exact percentile baselines, Module 5 (Baseline Store) will
   * maintain a circular buffer of raw values.
   */
  private evictHalf(state: MetricState): void {
    const halfN = Math.floor(state.stats.n / 2);
    // Approximate: keep mean and variance, halve the sample count.
    // M2 scales linearly with n for fixed variance.
    const newM2 = (state.stats.m2 / state.stats.n) * halfN;
    state.stats = {
      n: halfN,
      mean: state.stats.mean,
      m2: newM2,
      min: state.stats.min,
      max: state.stats.max,
    };
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _instance: AnomalyEngine | null = null;

/**
 * Get the singleton AnomalyEngine instance.
 * Creates a new one with default config if none exists.
 */
export function getAnomalyEngine(
  config?: Partial<AnomalyEngineConfig>,
): AnomalyEngine {
  if (!_instance) {
    _instance = new AnomalyEngine(config);
  }
  return _instance;
}

/**
 * Reset the singleton (test use only).
 */
export function resetAnomalyEngine(): void {
  _instance = null;
}
