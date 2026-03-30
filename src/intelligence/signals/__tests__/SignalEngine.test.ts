/**
 * Module 1: Metrics & Signal Engine — Unit Tests
 *
 * Test strategy:
 *   1. Math utilities — pure functions, deterministic
 *   2. SignalEngine.record() — bucket management
 *   3. SignalEngine.snapshot() — aggregation correctness
 *   4. RPS calculation — exact arithmetic
 *   5. p95 latency — interpolation accuracy
 *   6. Error rate — boundary conditions
 *   7. Repetition detection — threshold logic
 *   8. Window eviction — stale bucket removal
 *   9. Memory bounds — maxTrackedKeys enforcement
 *  10. Edge cases — empty windows, single requests
 */

import {
  percentile,
  mergeSorted,
  insertSorted,
  truncateSamples,
  arithmeticMean,
  rps,
  errorRate,
  dominanceRatio,
  toBucketMs,
} from '../math';

import { SignalEngine, resetSignalEngine } from '../SignalEngine';
import { RequestEvent } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<RequestEvent> = {}): RequestEvent {
  return {
    timestampMs: Date.now(),
    method: 'GET',
    path: '/api/test',
    upstream: 'test-service',
    statusCode: 200,
    latencyMs: 100,
    requestBytes: 256,
    responseBytes: 1024,
    fingerprint: 'fp-default',
    ...overrides,
  };
}

const KEY = 'GET:/api/test:test-service';

// ─── 1. Math Utilities ────────────────────────────────────────────────────────

describe('percentile()', () => {
  test('returns 0 for empty array', () => {
    expect(percentile([], 95)).toBe(0);
  });

  test('returns the only element for single-element array', () => {
    expect(percentile([42], 95)).toBe(42);
  });

  test('p0 = minimum', () => {
    expect(percentile([1, 2, 3, 4, 5], 0)).toBe(1);
  });

  test('p100 = maximum', () => {
    expect(percentile([1, 2, 3, 4, 5], 100)).toBe(5);
  });

  test('p50 of [1,2,3,4,5] = 3 (exact median)', () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
  });

  test('p50 of [1,2,3,4] = 2.5 (interpolated)', () => {
    expect(percentile([1, 2, 3, 4], 50)).toBeCloseTo(2.5);
  });

  test('p95 of 100 evenly-spaced values', () => {
    const arr = Array.from({ length: 100 }, (_, i) => i + 1); // [1..100]
    expect(percentile(arr, 95)).toBeCloseTo(95.05, 1);
  });

  test('p99 of latency samples matches expected value', () => {
    // Simulates 200 requests with latency 10–210ms
    const samples = Array.from({ length: 200 }, (_, i) => 10 + i);
    const p99 = percentile(samples, 99);
    expect(p99).toBeGreaterThan(205);
    expect(p99).toBeLessThanOrEqual(210);
  });
});

describe('mergeSorted()', () => {
  test('merges two sorted arrays correctly', () => {
    expect(mergeSorted([1, 3, 5], [2, 4, 6])).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('handles empty left array', () => {
    expect(mergeSorted([], [1, 2, 3])).toEqual([1, 2, 3]);
  });

  test('handles empty right array', () => {
    expect(mergeSorted([1, 2, 3], [])).toEqual([1, 2, 3]);
  });

  test('handles both empty', () => {
    expect(mergeSorted([], [])).toEqual([]);
  });
});

describe('insertSorted()', () => {
  test('inserts into correct position', () => {
    const arr = [1, 3, 5, 7];
    insertSorted(arr, 4);
    expect(arr).toEqual([1, 3, 4, 5, 7]);
  });

  test('inserts at beginning', () => {
    const arr = [3, 5, 7];
    insertSorted(arr, 1);
    expect(arr).toEqual([1, 3, 5, 7]);
  });

  test('inserts at end', () => {
    const arr = [1, 3, 5];
    insertSorted(arr, 9);
    expect(arr).toEqual([1, 3, 5, 9]);
  });

  test('inserts into empty array', () => {
    const arr: number[] = [];
    insertSorted(arr, 5);
    expect(arr).toEqual([5]);
  });

  test('inserts duplicate value', () => {
    const arr = [1, 3, 3, 5];
    insertSorted(arr, 3);
    expect(arr).toEqual([1, 3, 3, 3, 5]);
  });
});

describe('truncateSamples()', () => {
  test('returns unchanged if within maxSize', () => {
    const arr = [1, 2, 3];
    expect(truncateSamples(arr, 5)).toBe(arr);
  });

  test('preserves min and max', () => {
    const arr = Array.from({ length: 1000 }, (_, i) => i);
    const truncated = truncateSamples(arr, 100);
    expect(truncated[0]).toBe(0);
    expect(truncated[truncated.length - 1]).toBe(999);
    expect(truncated).toHaveLength(100);
  });
});

describe('arithmetic utilities', () => {
  test('arithmeticMean: 0 count returns 0', () => {
    expect(arithmeticMean(500, 0)).toBe(0);
  });

  test('arithmeticMean: correct calculation', () => {
    expect(arithmeticMean(300, 3)).toBe(100);
  });

  test('rps: 0 window returns 0', () => {
    expect(rps(100, 0)).toBe(0);
  });

  test('rps: correct calculation', () => {
    expect(rps(100, 10)).toBe(10);
  });

  test('errorRate: 0 total returns 0', () => {
    expect(errorRate(5, 0)).toBe(0);
  });

  test('errorRate: correct calculation', () => {
    expect(errorRate(5, 100)).toBeCloseTo(0.05);
  });

  test('dominanceRatio: 0 total returns 0', () => {
    expect(dominanceRatio(5, 0)).toBe(0);
  });

  test('toBucketMs: truncates to second boundary', () => {
    expect(toBucketMs(1711670423847)).toBe(1711670423000);
  });

  test('toBucketMs: already on boundary unchanged', () => {
    expect(toBucketMs(1711670423000)).toBe(1711670423000);
  });
});

// ─── 2. SignalEngine ──────────────────────────────────────────────────────────

describe('SignalEngine', () => {
  let engine: SignalEngine;
  const now = 1711670420000; // fixed reference time

  beforeEach(() => {
    resetSignalEngine();
    engine = new SignalEngine({
      windowSizeSeconds: 10,
      maxSamplesPerBucket: 200,
      repetitionThreshold: 0.3,
      maxTrackedKeys: 100,
      evictionIntervalMs: 60000, // disable auto eviction in tests
    });
  });

  afterEach(() => {
    engine.shutdown();
  });

  // ── 2.1 Basic recording ────────────────────────────────────────────────────

  test('returns null snapshot for unknown key', () => {
    expect(engine.snapshot('UNKNOWN:/:unknown')).toBeNull();
  });

  test('tracks a key after first record', () => {
    engine.record(makeEvent({ timestampMs: now }));
    expect(engine.keys()).toContain(KEY);
  });

  test('snapshot returns requestCount = 1 after single record', () => {
    engine.record(makeEvent({ timestampMs: now }));
    const snap = engine.snapshot(KEY, now);
    expect(snap).not.toBeNull();
    expect(snap!.requestCount).toBe(1);
  });

  // ── 2.2 RPS ───────────────────────────────────────────────────────────────

  test('RPS: 10 requests in 10-second window = 1.0 rps', () => {
    for (let i = 0; i < 10; i++) {
      engine.record(makeEvent({ timestampMs: now + i * 500 }));
    }
    const snap = engine.snapshot(KEY, now + 5000);
    expect(snap!.rps).toBeCloseTo(1.0);
  });

  test('RPS: 100 requests in 10-second window = 10.0 rps', () => {
    for (let i = 0; i < 100; i++) {
      engine.record(makeEvent({ timestampMs: now + (i * 100) }));
    }
    const snap = engine.snapshot(KEY, now + 10000);
    expect(snap!.rps).toBeCloseTo(10.0);
  });

  // ── 2.3 Latency percentiles ───────────────────────────────────────────────

  test('p95 latency is computed correctly', () => {
    for (let i = 1; i <= 100; i++) {
      engine.record(makeEvent({ timestampMs: now, latencyMs: i }));
    }
    const snap = engine.snapshot(KEY, now);
    expect(snap!.p95LatencyMs).toBeGreaterThan(94);
    expect(snap!.p95LatencyMs).toBeLessThanOrEqual(100);
  });

  test('p50 latency is the median', () => {
    for (let i = 1; i <= 100; i++) {
      engine.record(makeEvent({ timestampMs: now, latencyMs: i * 10 }));
    }
    const snap = engine.snapshot(KEY, now);
    expect(snap!.p50LatencyMs).toBeCloseTo(505, 0);
  });

  test('mean latency is correct', () => {
    for (let i = 0; i < 10; i++) {
      engine.record(makeEvent({ timestampMs: now, latencyMs: 100 }));
    }
    const snap = engine.snapshot(KEY, now);
    expect(snap!.meanLatencyMs).toBe(100);
  });

  // ── 2.4 Error rate ────────────────────────────────────────────────────────

  test('errorRate = 0 when no 5xx', () => {
    for (let i = 0; i < 10; i++) {
      engine.record(makeEvent({ timestampMs: now, statusCode: 200 }));
    }
    expect(engine.snapshot(KEY, now)!.errorRate).toBe(0);
  });

  test('errorRate = 0.5 when half are 5xx', () => {
    for (let i = 0; i < 5; i++) {
      engine.record(makeEvent({ timestampMs: now, statusCode: 200 }));
      engine.record(makeEvent({ timestampMs: now, statusCode: 500 }));
    }
    expect(engine.snapshot(KEY, now)!.errorRate).toBeCloseTo(0.5);
  });

  test('errorRate = 1.0 when all are 5xx', () => {
    for (let i = 0; i < 5; i++) {
      engine.record(makeEvent({ timestampMs: now, statusCode: 503 }));
    }
    expect(engine.snapshot(KEY, now)!.errorRate).toBe(1.0);
  });

  test('clientErrorRate counts 4xx separately from 5xx', () => {
    engine.record(makeEvent({ timestampMs: now, statusCode: 404 }));
    engine.record(makeEvent({ timestampMs: now, statusCode: 200 }));
    const snap = engine.snapshot(KEY, now)!;
    expect(snap.clientErrorRate).toBeCloseTo(0.5);
    expect(snap.errorRate).toBe(0);
  });

  // ── 2.5 Repetition detection ──────────────────────────────────────────────

  test('isRepetitive = false when all fingerprints unique', () => {
    for (let i = 0; i < 10; i++) {
      engine.record(makeEvent({ timestampMs: now, fingerprint: `fp-${i}` }));
    }
    expect(engine.snapshot(KEY, now)!.repetition.isRepetitive).toBe(false);
  });

  test('isRepetitive = true when 40% requests share same fingerprint', () => {
    // threshold = 0.3, 4/10 = 0.4 > threshold
    for (let i = 0; i < 4; i++) {
      engine.record(makeEvent({ timestampMs: now, fingerprint: 'fp-repeated' }));
    }
    for (let i = 0; i < 6; i++) {
      engine.record(makeEvent({ timestampMs: now, fingerprint: `fp-unique-${i}` }));
    }
    const snap = engine.snapshot(KEY, now)!;
    expect(snap.repetition.isRepetitive).toBe(true);
    expect(snap.repetition.topFingerprint).toBe('fp-repeated');
    expect(snap.repetition.count).toBe(4);
    expect(snap.repetition.dominanceRatio).toBeCloseTo(0.4);
  });

  test('isRepetitive = true when exactly at threshold boundary', () => {
    // threshold = 0.3, 3/10 = 0.3 — equals threshold → isRepetitive = true (uses >=)
    for (let i = 0; i < 3; i++) {
      engine.record(makeEvent({ timestampMs: now, fingerprint: 'fp-repeated' }));
    }
    for (let i = 0; i < 7; i++) {
      engine.record(makeEvent({ timestampMs: now, fingerprint: `fp-unique-${i}` }));
    }
    // dominanceRatio = 0.3 = threshold → isRepetitive = true (ratio >= threshold)
    const snap = engine.snapshot(KEY, now)!;
    expect(snap.repetition.isRepetitive).toBe(true);
  });

  // ── 2.6 Window eviction ───────────────────────────────────────────────────

  test('requests older than windowSizeSeconds are excluded', () => {
    // Record 5 requests 15 seconds ago (outside 10s window)
    const oldTime = now - 15000;
    for (let i = 0; i < 5; i++) {
      engine.record(makeEvent({ timestampMs: oldTime }));
    }
    // Record 3 recent requests
    for (let i = 0; i < 3; i++) {
      engine.record(makeEvent({ timestampMs: now }));
    }

    // Snapshot at 'now' — only 3 recent requests should be visible
    const snap = engine.snapshot(KEY, now)!;

    expect(snap.requestCount).toBe(3);
  });

  // ── 2.7 Memory bounds ─────────────────────────────────────────────────────

  test('does not exceed maxTrackedKeys', () => {
    const maxKeys = 10;
    const boundedEngine = new SignalEngine({
      maxTrackedKeys: maxKeys,
      evictionIntervalMs: 60000,
    });

    // Record 20 distinct keys
    for (let i = 0; i < 20; i++) {
      boundedEngine.record(makeEvent({
        timestampMs: now + i, // slight offset so LRU order is deterministic
        path: `/api/resource-${i}`,
      }));
    }

    expect(boundedEngine.keys().length).toBeLessThanOrEqual(maxKeys);
    boundedEngine.shutdown();
  });

  // ── 2.8 Multiple keys tracked simultaneously ──────────────────────────────

  test('tracks multiple keys independently', () => {
    engine.record(makeEvent({ path: '/api/users', statusCode: 200, latencyMs: 50, timestampMs: now }));
    engine.record(makeEvent({ path: '/api/orders', statusCode: 500, latencyMs: 800, timestampMs: now }));

    const usersKey = 'GET:/api/users:test-service';
    const ordersKey = 'GET:/api/orders:test-service';

    const usersSnap = engine.snapshot(usersKey, now)!;
    const ordersSnap = engine.snapshot(ordersKey, now)!;

    expect(usersSnap.errorRate).toBe(0);
    expect(ordersSnap.errorRate).toBe(1);
    expect(usersSnap.meanLatencyMs).toBe(50);
    expect(ordersSnap.meanLatencyMs).toBe(800);
  });

  // ── 2.9 snapshotAll ───────────────────────────────────────────────────────

  test('snapshotAll returns snapshots for all tracked keys', () => {
    engine.record(makeEvent({ path: '/api/a', timestampMs: now }));
    engine.record(makeEvent({ path: '/api/b', timestampMs: now }));
    engine.record(makeEvent({ path: '/api/c', timestampMs: now }));
    expect(engine.snapshotAll(now)).toHaveLength(3);
  });

  // ── 2.10 Edge cases ───────────────────────────────────────────────────────

  test('snapshot of key with 0 requests in window returns 0 for all rates', () => {
    // Record a request far in the past
    engine.record(makeEvent({ timestampMs: now - 20000 }));
    const snap = engine.snapshot(KEY, now)!;
    expect(snap.requestCount).toBe(0);
    expect(snap.rps).toBe(0);
    expect(snap.errorRate).toBe(0);
    expect(snap.meanLatencyMs).toBe(0);
  });
});
