/**
 * Module 2: Math/Anomaly Engine — Type Definitions
 *
 * All types are pure data (no methods). No LLM, no I/O.
 *
 * Design decisions:
 * - Z-score computed against a rolling baseline (configurable window)
 * - Trend via simple linear regression on evenly-spaced time samples
 * - Confidence is a weighted combination of signal agreement, sample count, and
 *   baseline stability — all values in [0.0, 1.0]
 * - All computed values are deterministic given the same input series
 */

// ── Primitives ──────────────────────────────────────────────────────────────

/**
 * A (x, y) data point used for regression and rolling statistics.
 * x is typically a timestamp offset in seconds; y is the metric value.
 */
export interface DataPoint {
  readonly x: number;
  readonly y: number;
}

// ── Rolling Baseline ─────────────────────────────────────────────────────────

/**
 * Accumulated statistics needed to compute rolling mean and stddev.
 * Uses Welford's online algorithm for numerical stability.
 */
export interface RollingStats {
  /** Number of observations so far */
  readonly n: number;
  /** Running mean */
  readonly mean: number;
  /** Running sum of squared deviations from mean (M2 in Welford's algorithm) */
  readonly m2: number;
  /** Minimum observed value */
  readonly min: number;
  /** Maximum observed value */
  readonly max: number;
}

/**
 * Immutable snapshot of a rolling baseline at a point in time.
 */
export interface BaselineSnapshot {
  readonly mean: number;
  readonly stddev: number;
  readonly min: number;
  readonly max: number;
  /** Number of observations in the baseline */
  readonly sampleCount: number;
}

// ── Z-score Anomaly ──────────────────────────────────────────────────────────

/**
 * Result of a z-score anomaly check on a single metric value.
 */
export interface ZScoreResult {
  /** The raw value being tested */
  readonly value: number;
  /** Computed z-score: (value - mean) / stddev. NaN if stddev = 0. */
  readonly zScore: number;
  /** True if |zScore| > threshold */
  readonly isAnomaly: boolean;
  /** Direction of the anomaly */
  readonly direction: 'high' | 'low' | 'none';
  /** The baseline snapshot used for this check */
  readonly baseline: BaselineSnapshot;
}

// ── Trend Detection ──────────────────────────────────────────────────────────

/**
 * Direction of a detected trend.
 * 'flat' means the slope is within the noise band.
 */
export type TrendDirection = 'rising' | 'falling' | 'flat';

/**
 * Result of linear regression on a metric time series.
 * y = slope * x + intercept (ordinary least squares)
 */
export interface TrendResult {
  /** Slope of the regression line (units: metric_unit / second) */
  readonly slope: number;
  /** Y-intercept */
  readonly intercept: number;
  /**
   * R² (coefficient of determination) in [0, 1].
   * Measures how well the line fits the data.
   * 1.0 = perfect fit, 0.0 = line explains nothing.
   */
  readonly r2: number;
  /** Human-readable trend direction */
  readonly direction: TrendDirection;
  /** Number of data points used in regression */
  readonly sampleCount: number;
}

// ── Confidence Scoring ───────────────────────────────────────────────────────

/**
 * Component weights used to compute final confidence.
 * All weights must be >= 0.0; they are normalised internally.
 */
export interface ConfidenceWeights {
  /** Weight for sample volume component */
  readonly sampleVolume: number;
  /** Weight for baseline stability component */
  readonly baselineStability: number;
  /** Weight for signal agreement component (z-score & trend agree) */
  readonly signalAgreement: number;
}

/**
 * Breakdown of how each component contributed to the final confidence score.
 */
export interface ConfidenceBreakdown {
  /** Raw score for each component in [0, 1] before weighting */
  readonly sampleVolumeScore: number;
  readonly baselineStabilityScore: number;
  readonly signalAgreementScore: number;
  /** Final weighted confidence in [0, 1] */
  readonly confidence: number;
}

// ── Combined Signal ──────────────────────────────────────────────────────────

/**
 * Full anomaly analysis for a single metric at a single point in time.
 * Produced by AnomalyEngine.analyze().
 */
export interface AnomalySignal {
  /** The metric key being analysed (e.g. "rps", "p95LatencyMs") */
  readonly metricKey: string;
  /** Timestamp of this analysis */
  readonly computedAtMs: number;
  /** Z-score anomaly check */
  readonly zScore: ZScoreResult;
  /** Trend over the provided series */
  readonly trend: TrendResult;
  /** Confidence in the anomaly verdict */
  readonly confidence: ConfidenceBreakdown;
  /**
   * Final verdict: true if the engine concludes this is an anomaly.
   * Requires isAnomaly = true AND confidence >= minConfidence threshold.
   */
  readonly isConfirmedAnomaly: boolean;
}

// ── Engine Config ─────────────────────────────────────────────────────────────

/**
 * Configuration for the AnomalyEngine.
 */
export interface AnomalyEngineConfig {
  /**
   * Z-score threshold above which a value is considered anomalous.
   * Typical values: 2.0 (loose), 2.5 (default), 3.0 (strict).
   * @default 2.5
   */
  readonly zScoreThreshold: number;
  /**
   * Minimum confidence (0–1) required to declare a confirmed anomaly.
   * @default 0.6
   */
  readonly minConfidence: number;
  /**
   * Minimum samples needed in the rolling baseline before anomaly detection
   * is enabled. Below this count, isConfirmedAnomaly is always false.
   * @default 10
   */
  readonly minBaselineSamples: number;
  /**
   * Maximum number of baseline observations retained per metric.
   * Oldest observations are evicted when the cap is reached.
   * @default 1000
   */
  readonly maxBaselineSize: number;
  /**
   * Relative slope magnitude (as fraction of mean) considered significant.
   * Slopes below this threshold produce direction='flat'.
   * @default 0.05  (5% of mean per second)
   */
  readonly trendNoiseFloor: number;
  /**
   * Weights for the confidence scoring components.
   * Defaults produce equal weighting.
   */
  readonly confidenceWeights: ConfidenceWeights;
}

/**
 * Engine interface — implemented by AnomalyEngine.
 */
export interface IAnomalyEngine {
  /**
   * Feed a new observation into the baseline for the given metric key.
   * Call this once per metric snapshot interval.
   */
  record(metricKey: string, value: number): void;

  /**
   * Analyse a new observed value against the current baseline and a
   * time-ordered series of recent values.
   *
   * @param metricKey   - identifies the metric (e.g. "rps", "p95LatencyMs")
   * @param currentValue - the value just observed (will NOT be recorded into baseline)
   * @param series      - recent (time, value) pairs used for trend detection,
   *                      ordered by ascending x (time offset in seconds)
   */
  analyze(
    metricKey: string,
    currentValue: number,
    series: DataPoint[],
  ): AnomalySignal;

  /**
   * Return the current baseline snapshot for a metric, or null if no data.
   */
  baseline(metricKey: string): BaselineSnapshot | null;

  /**
   * Reset baseline for a specific metric (e.g. after a deployment).
   */
  reset(metricKey: string): void;

  /**
   * Reset all baselines.
   */
  resetAll(): void;
}
