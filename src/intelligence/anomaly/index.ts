// Copyright (c) 2026 Tapas Adhikary. All rights reserved.
// This file is part of the FlexGate Runtime Intelligence Layer.
// Licensed under the Business Source License 1.1 (BUSL-1.1).
// See LICENSE in the project root for full terms.
// Commercial use requires a separate license. Change Date: 2030-04-06.

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
