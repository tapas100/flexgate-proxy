// Copyright (c) 2026 Tapas Adhikary. All rights reserved.
// This file is part of the FlexGate Runtime Intelligence Layer.
// Licensed under the Business Source License 1.1 (BUSL-1.1).
// See LICENSE in the project root for full terms.
// Commercial use requires a separate license. Change Date: 2030-04-06.

/**
 * Module 1: Metrics & Signal Engine — Type Definitions
 *
 * All types are pure data structures. No business logic here.
 * Every field is documented with its unit and valid range.
 */

// ─── Raw Request Event ───────────────────────────────────────────────────────

/**
 * Emitted by the proxy layer for every proxied request.
 * This is the single source of truth for the Signal Engine.
 */
export interface RequestEvent {
  /** Monotonic timestamp in milliseconds (Date.now()) */
  readonly timestampMs: number;

  /** HTTP method — uppercase */
  readonly method: string;

  /** Normalised path, no query string. e.g. "/api/users" */
  readonly path: string;

  /** Full upstream key, e.g. "payments-service" */
  readonly upstream: string;

  /** HTTP status code returned to the client */
  readonly statusCode: number;

  /** Round-trip latency in milliseconds (proxy measured) */
  readonly latencyMs: number;

  /** Request body size in bytes (0 if no body) */
  readonly requestBytes: number;

  /** Response body size in bytes (0 if no body) */
  readonly responseBytes: number;

  /**
   * Fingerprint of the request for repetition detection.
   * SHA-256(method + path + sorted-query-string + body-hash).
   * Computed by the proxy layer BEFORE calling record().
   */
  readonly fingerprint: string;
}

// ─── Sliding Window Bucket ───────────────────────────────────────────────────

/**
 * A single 1-second bucket inside the sliding window.
 * Using integer arithmetic only — no floats until percentile calculation.
 */
export interface WindowBucket {
  /** Start of this bucket (truncated to second boundary) */
  readonly startMs: number;

  /** Number of requests in this bucket */
  requestCount: number;

  /** Sum of all latencies in this bucket (ms) */
  latencySum: number;

  /** Sorted latency samples for percentile calculation (max 1000 per bucket) */
  latencySamples: number[];

  /** Number of requests with statusCode >= 500 */
  errorCount: number;

  /** Number of requests with statusCode >= 400 and < 500 */
  clientErrorCount: number;

  /** Total request bytes received */
  requestBytes: number;

  /** Total response bytes sent */
  responseBytes: number;
}

// ─── Computed Window Snapshot ────────────────────────────────────────────────

/**
 * Point-in-time snapshot computed from the sliding window.
 * All values are deterministic given the same window state.
 */
export interface WindowSnapshot {
  /** Path + upstream key this snapshot belongs to */
  readonly key: string;

  /** When this snapshot was computed */
  readonly computedAtMs: number;

  /** Window size used (seconds) */
  readonly windowSizeSeconds: number;

  /** Requests per second over the window (exact: requestCount / windowSizeSeconds) */
  readonly rps: number;

  /** Total requests in the window */
  readonly requestCount: number;

  /** Error rate: errorCount / requestCount, range [0, 1] */
  readonly errorRate: number;

  /** Client error rate: clientErrorCount / requestCount, range [0, 1] */
  readonly clientErrorRate: number;

  /** Arithmetic mean latency (ms) */
  readonly meanLatencyMs: number;

  /** p50 latency (ms) — interpolated */
  readonly p50LatencyMs: number;

  /** p95 latency (ms) — interpolated */
  readonly p95LatencyMs: number;

  /** p99 latency (ms) — interpolated */
  readonly p99LatencyMs: number;

  /** Max latency in the window (ms) */
  readonly maxLatencyMs: number;

  /** Min latency in the window (ms) */
  readonly minLatencyMs: number;

  /** Average request payload (bytes) */
  readonly avgRequestBytes: number;

  /** Average response payload (bytes) */
  readonly avgResponseBytes: number;

  /** Repetition signal — see RepetitionSignal */
  readonly repetition: RepetitionSignal;
}

// ─── Repetition Signal ───────────────────────────────────────────────────────

/**
 * Indicates whether the same request is being made repeatedly.
 * Used by the Rule Engine to suggest caching.
 */
export interface RepetitionSignal {
  /** Most-repeated fingerprint in the current window */
  readonly topFingerprint: string | null;

  /** How many times it appeared in the window */
  readonly count: number;

  /** Ratio of top fingerprint to total requests, range [0, 1] */
  readonly dominanceRatio: number;

  /** True if dominanceRatio >= configured threshold (default 0.3) */
  readonly isRepetitive: boolean;
}

// ─── Signal Engine Config ────────────────────────────────────────────────────

export interface SignalEngineConfig {
  /**
   * Sliding window size in seconds.
   * Valid range: 5–300. Default: 10.
   */
  windowSizeSeconds: number;

  /**
   * How many latency samples to keep per bucket.
   * Higher = more accurate percentiles, more memory.
   * Default: 200.
   */
  maxSamplesPerBucket: number;

  /**
   * Dominance ratio threshold to classify a request as repetitive.
   * Default: 0.3 (30% of window requests share same fingerprint).
   */
  repetitionThreshold: number;

  /**
   * Maximum number of distinct keys (path+upstream combos) to track.
   * Prevents unbounded memory growth.
   * Default: 1000.
   */
  maxTrackedKeys: number;

  /**
   * How often (ms) to evict expired buckets.
   * Default: 1000 (every second).
   */
  evictionIntervalMs: number;
}

// ─── Signal Engine API ───────────────────────────────────────────────────────

export interface ISignalEngine {
  /** Record a completed request event */
  record(event: RequestEvent): void;

  /** Get current window snapshot for a given path+upstream key */
  snapshot(key: string, atMs?: number): WindowSnapshot | null;

  /** Get snapshots for all tracked keys */
  snapshotAll(atMs?: number): WindowSnapshot[];

  /** Get list of all currently tracked keys */
  keys(): string[];

  /** Graceful shutdown — stops the eviction timer */
  shutdown(): void;
}
