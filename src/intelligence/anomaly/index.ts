/**
 * Module 2: Math/Anomaly Engine — Public API
 */

export type {
  DataPoint,
  RollingStats,
  BaselineSnapshot,
  ZScoreResult,
  TrendResult,
  TrendDirection,
  ConfidenceWeights,
  ConfidenceBreakdown,
  AnomalySignal,
  AnomalyEngineConfig,
  IAnomalyEngine,
} from './types';

export {
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
} from './math';

export {
  AnomalyEngine,
  getAnomalyEngine,
  resetAnomalyEngine,
} from './AnomalyEngine';
