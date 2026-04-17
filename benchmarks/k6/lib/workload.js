/**
 * benchmarks/k6/lib/workload.js
 *
 * Realistic traffic workload definitions for Stage 2 benchmarking.
 *
 * Exports
 * ───────
 *   ROUTES          — array of route definitions to seed into FlexGate
 *   pickRequest()   — weighted-random request selector; returns { method, path, body, tag }
 *   thinkTimeMs()   — per-iteration pause drawn from a Pareto-tail distribution
 *                     simulating realistic human / browser pacing
 *   REALISTIC_THRESHOLDS — k6 threshold object tuned for realistic (lower RPS) traffic
 *
 * Request mix rationale
 * ─────────────────────
 * A proxy benchmark that hammers a single path with GET forever overfits to
 * the route-cache hot path.  Real traffic has:
 *   - Multiple paths (cold + warm route cache entries)
 *   - POST with JSON body (body parsing, Content-Type negotiation)
 *   - A small fraction of "not found" paths (negative cache pressure)
 *   - Think time drawn from a heavy-tail distribution (not uniform sleep)
 *
 * Weight table (total = 1000 shares):
 *
 *   Path                  Method  Weight  Rationale
 *   ───────────────────── ─────── ─────── ─────────────────────────────────
 *   /bench                GET      400    Primary hot path (baseline compat)
 *   /bench/v2             GET      150    Second hot route, different cache key
 *   /bench/echo           POST     150    Body parsing pressure
 *   /bench/status         GET      100    Shallow health-style endpoint
 *   /bench/items          GET       80    List-style URL
 *   /bench/items/42       GET       60    Resource-with-ID path
 *   /bench/slow           GET       30    Simulated slow upstream (50 ms echo latency)
 *   /bench/missing        GET       30    404 — exercises negative-cache / error path
 *
 * Note: /bench/slow requires the echo server to be started with -latency 50000
 * for that path.  In run-all.sh a second echo instance on :9007 with -latency
 * 50000 handles this; HAProxy routes /bench/slow to that backend.
 *
 * Think time model
 * ────────────────
 * Think time is drawn from a Pareto distribution with α=1.5 and x_m=50ms.
 * This produces a right-skewed delay where most iterations pause 50–200 ms
 * but occasional "long pauses" stretch to several seconds — matching
 * browser-level user pacing far better than uniform random sleep.
 *
 *   P(X > x) = (x_m / x)^α    for x >= x_m
 *
 * Capped at MAX_THINK_MS=3000 to avoid runaway outliers dominating VU time.
 */

import { sleep } from 'k6';

// ── Route seeds (sent to FlexGate admin API in run-all.sh) ───────────────────

/**
 * Routes that MUST exist in FlexGate before the realistic scenario runs.
 * run-all.sh POSTs each one to /api/routes; duplicates are silently ignored.
 *
 * Each object matches the FlexGate route payload shape.
 */
export const ROUTES = [
  { path: '/bench',        target: 'http://127.0.0.1:9000', methods: ['GET'],         active: true },
  { path: '/bench/v2',     target: 'http://127.0.0.1:9000', methods: ['GET'],         active: true },
  { path: '/bench/echo',   target: 'http://127.0.0.1:9000', methods: ['POST'],        active: true },
  { path: '/bench/status', target: 'http://127.0.0.1:9000', methods: ['GET'],         active: true },
  { path: '/bench/items',  target: 'http://127.0.0.1:9000', methods: ['GET'],         active: true },
  // /bench/items/:id — FlexGate matches prefix, echo returns same response
  { path: '/bench/items/', target: 'http://127.0.0.1:9000', methods: ['GET'],         active: true },
  // /bench/slow routes to a second echo instance with simulated latency
  { path: '/bench/slow',   target: 'http://127.0.0.1:9007', methods: ['GET'],         active: true },
  // /bench/missing intentionally has NO route — exercises 404/not-found path
];

// ── Request mix ───────────────────────────────────────────────────────────────

/**
 * Internal weighted request table.
 * Each entry: { method, path, tag, weight, body? }
 *
 * tag is attached to k6 metrics so the comparison report can break down
 * latency per request class.
 */
const REQUEST_TABLE = [
  { method: 'GET',  path: '/bench',          tag: 'hot-get',       weight: 400 },
  { method: 'GET',  path: '/bench/v2',        tag: 'warm-get',      weight: 150 },
  { method: 'POST', path: '/bench/echo',      tag: 'post-body',     weight: 150,
    body: JSON.stringify({ action: 'echo', payload: 'x'.repeat(64) }),
    headers: { 'Content-Type': 'application/json' } },
  { method: 'GET',  path: '/bench/status',    tag: 'status-get',    weight: 100 },
  { method: 'GET',  path: '/bench/items',     tag: 'list-get',      weight:  80 },
  { method: 'GET',  path: '/bench/items/42',  tag: 'resource-get',  weight:  60 },
  { method: 'GET',  path: '/bench/slow',      tag: 'slow-get',      weight:  30 },
  { method: 'GET',  path: '/bench/missing',   tag: 'not-found',     weight:  30 },
];

// Pre-build the cumulative weight array for O(log n) selection
const TOTAL_WEIGHT = REQUEST_TABLE.reduce((s, r) => s + r.weight, 0);
const CUM_WEIGHTS  = [];
REQUEST_TABLE.reduce((acc, r, i) => {
  CUM_WEIGHTS[i] = acc + r.weight;
  return CUM_WEIGHTS[i];
}, 0);

/**
 * pickRequest()
 *
 * Returns one entry from REQUEST_TABLE using weighted-random selection.
 * Uses Math.random() — k6's built-in, seeded per-VU.
 *
 * @returns {{ method: string, path: string, tag: string, body?: string, headers?: object }}
 */
export function pickRequest() {
  const r   = Math.random() * TOTAL_WEIGHT;
  let   idx = 0;
  while (idx < CUM_WEIGHTS.length - 1 && r > CUM_WEIGHTS[idx]) idx++;
  return REQUEST_TABLE[idx];
}

// ── Think time ────────────────────────────────────────────────────────────────

const PARETO_ALPHA  = 1.5;   // shape — lower = heavier tail
const PARETO_XM_MS  = 50;    // minimum think time (ms)
const MAX_THINK_MS  = 3000;  // cap to prevent outlier VU stalls

/**
 * paretoSample()
 *
 * Draw one sample from a Pareto(α, x_m) distribution using the
 * inverse-CDF method:
 *
 *   X = x_m / U^(1/α)   where U ~ Uniform(0,1)
 *
 * This is a pure JS implementation safe to call inside a k6 VU context.
 *
 * @returns {number} milliseconds
 */
function paretoSample() {
  const u  = Math.random();
  const ms = PARETO_XM_MS / Math.pow(u, 1 / PARETO_ALPHA);
  return Math.min(ms, MAX_THINK_MS);
}

/**
 * thinkTimeMs()
 *
 * Returns the think-time duration (ms) for this iteration and also
 * calls k6's sleep() so the VU waits for the correct duration.
 *
 * Call this at the END of each VU iteration.
 *
 * @returns {number} actual sleep duration in ms (for logging)
 */
export function thinkTimeMs() {
  const ms = paretoSample();
  sleep(ms / 1000);
  return ms;
}

// ── Realistic-traffic thresholds ──────────────────────────────────────────────

/**
 * REALISTIC_THRESHOLDS
 *
 * Relaxed compared to STRICT because:
 *  - Think time reduces effective RPS — p99 budget can be wider
 *  - /bench/slow is intentionally 50 ms baseline latency
 *  - /bench/missing returns 404 which counts as failed (expected, excluded
 *    from duration thresholds via tags in the scenario)
 *
 * The separate `http_req_duration{tag:hot-get}` threshold is the one that
 * matters for overhead comparison with Stage 1 numbers.
 */
export const REALISTIC_THRESHOLDS = {
  // Overall (includes slow path — intentionally generous)
  'http_req_failed':                               ['rate<0.05'],   // 5 % — not-found 404s are expected
  'http_req_duration{tag:hot-get}':                ['p(95)<50', 'p(99)<100'],
  'http_req_duration{tag:warm-get}':               ['p(95)<50', 'p(99)<100'],
  'http_req_duration{tag:post-body}':              ['p(95)<75', 'p(99)<150'],
  'http_req_duration{tag:status-get}':             ['p(95)<50', 'p(99)<100'],
  'http_req_duration{tag:list-get}':               ['p(95)<50', 'p(99)<100'],
  'http_req_duration{tag:resource-get}':           ['p(95)<50', 'p(99)<100'],
  'http_req_duration{tag:slow-get}':               ['p(95)<200', 'p(99)<350'],  // slow upstream
  // not-found: only check that it doesn't hang
  'http_req_duration{tag:not-found}':              ['p(99)<200'],
};
