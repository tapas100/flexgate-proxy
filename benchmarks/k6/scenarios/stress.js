/**
 * benchmarks/k6/scenarios/stress.js
 *
 * Scenario 8 — Stress Test (Stage 3)
 *
 * Goal
 * ────
 *   Find the exact VU/RPS level at which FlexGate begins to degrade:
 *   the "breaking point" where error rate exceeds 1 % or p99 exceeds 500 ms.
 *
 *   Unlike steady-load (which proves the system works) or spike (which tests
 *   burst resilience), stress deliberately pushes beyond capacity to:
 *     1. Identify the saturation point
 *     2. Confirm that errors are bounded (no crash, no OOM, no hung goroutines)
 *     3. Verify the system recovers fully after the overload is removed
 *
 *   The run is EXPECTED to eventually breach thresholds — abortOnFail is set
 *   only at clearly unrecoverable levels (10 % error rate, 2 s p99).
 *
 * Topology
 * ────────
 *   k6  ──►  HAProxy (:9003)  ──►  FlexGate (:8080)  ──►  Echo (:9000)
 *
 * Load shape — staircase (full profile)
 * ──────────────────────────────────────
 *   Step   VUs   RPS equiv   Duration   Label
 *   ────── ───── ─────────── ────────── ──────────
 *    1      50    ~500        30 s       step-1
 *    2     100    ~1 000      30 s       step-2
 *    3     150    ~1 500      30 s       step-3
 *    4     200    ~2 000      30 s       step-4
 *    5     250    ~2 500      30 s       step-5
 *    6     300    ~3 000      30 s       step-6
 *    7     400    ~4 000      30 s       step-7
 *    8     500    ~5 000      30 s       step-8  ← expected break zone
 *    9     600    ~6 000      30 s       step-9
 *   10     750    ~7 500      30 s       step-10
 *   drain    0      —         30 s       drain   ← verify recovery
 *   ────── ───── ─────────── ────────── ──────────
 *   Total                    330 s
 *
 * Load shape (ci profile)
 * ───────────────────────
 *   4 steps × 15 s (max 150 VUs) + 15 s drain = 75 s total.
 *   Never expected to break; used only to gate that the staircase logic works.
 *
 * Pass/fail criteria
 * ──────────────────
 *   ✔  error rate stays < 10 %  (hard abort if breached)
 *   ✔  p99 stays < 2 000 ms     (hard abort if breached)
 *   (softer) error rate < 1 % and p99 < 500 ms — noted in report as breaking point
 *
 * Captured metrics
 * ────────────────
 *   - http_req_duration per step tag  (see the staircase in detail)
 *   - http_req_failed rate
 *   - overhead_ms vs baseline
 *   - tail_breaches
 *   - breaking_point: first step where error_rate > 1% (in envelope.stress_meta)
 *
 * Manual run
 * ──────────
 *   TARGET_URL=http://localhost:9003/api/test \
 *   PROFILE=full \
 *   k6 run --out json=benchmarks/results/stress-$(date +%s).json \
 *          benchmarks/k6/scenarios/stress.js
 */

import http            from 'k6/http';
import { check }       from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';
import { Counter }     from 'k6/metrics';

import { buildTags, recordOverhead }    from '../lib/metrics.js';
import { buildEnvelope }                from '../lib/result.js';
import { STRESS_STAGES, STRESS_TIMING,
         STRESS_STAGES_CI,
         STRESS_THRESHOLDS,
         stressStepLabel }              from '../lib/load-profiles.js';

// ── Configuration ─────────────────────────────────────────────────────────────

const SCENARIO = 'stress';
const TARGET   = __ENV.TARGET_URL || 'http://localhost:9003';
const PROFILE  = __ENV.PROFILE    || 'full';

// ── Custom metric: per-step error counter ─────────────────────────────────────
// Used in handleSummary to identify the breaking-point step.
const StepErrors = new Counter('step_errors');

// ── k6 options ────────────────────────────────────────────────────────────────

export const options = {
  tags: { scenario: SCENARIO },

  stages: PROFILE === 'ci' ? STRESS_STAGES_CI : STRESS_STAGES,

  thresholds: STRESS_THRESHOLDS,
};

// ── Setup ─────────────────────────────────────────────────────────────────────

export function setup() {
  const res = http.get(`${TARGET}/health`, { timeout: '5s' });
  if (res.status !== 200) {
    throw new Error(
      `[stress] Target not reachable: ${TARGET}/health → HTTP ${res.status}\n` +
      'Ensure echo server, FlexGate, and HAProxy are running.'
    );
  }
  return { startTs: Date.now(), scenario: SCENARIO, target: TARGET };
}

// ── VU iteration ─────────────────────────────────────────────────────────────

export default function (data) {
  const elapsed  = Date.now() - data.startTs;
  const stepMs   = (STRESS_TIMING.stepDuration || 30) * 1000;
  const stepLabel = PROFILE === 'ci'
    ? stressStepLabel(elapsed, 15_000)   // CI: 15-s steps
    : stressStepLabel(elapsed, stepMs);

  const tags = {
    ...buildTags(SCENARIO, stepLabel),
    step: stepLabel,   // explicit tag so threshold{step:step-N} filters work
  };

  const res = http.get(`${TARGET}/api/test`, {
    tags,
    timeout: '15s',
  });

  const ok = check(res, {
    'status 200':         (r) => r.status === 200,
    'no server error':    (r) => r.status < 500,
    'duration < 2000ms':  (r) => r.timings.duration < 2000,
  });

  if (!ok) {
    StepErrors.add(1, { step: stepLabel });
  }

  // Overhead recording — shows when overhead starts growing as load climbs
  recordOverhead(res.timings.duration, 500);

  // No sleep — maximum pressure per VU to saturate the system quickly
}

// ── Teardown ──────────────────────────────────────────────────────────────────

export function teardown(data) {
  console.log(JSON.stringify({
    event:    'teardown',
    scenario: SCENARIO,
    target:   TARGET,
    profile:  PROFILE,
    startTs:  data.startTs,
    endTs:    Date.now(),
  }));
}

// ── Custom summary → JSON result envelope ─────────────────────────────────────

export function handleSummary(data) {
  const ts      = Math.floor(Date.now() / 1000);
  const outFile = `benchmarks/results/${SCENARIO}-${ts}.json`;

  const envelope = buildEnvelope(SCENARIO, TARGET, PROFILE, data);

  // ── Identify breaking-point step ─────────────────────────────────────────
  // Walk per-step error counters to find the first step where errors appeared.
  // k6 exposes tagged counter values under data.metrics.<name>.values.
  const stepErrorsMetric = data.metrics['step_errors'];
  let breakingStep = null;

  if (stepErrorsMetric) {
    // Tag groups are nested under data.metrics.step_errors.values.<tag-set>
    // k6 summary groups tagged values differently per version — iterate safely
    const perStep = {};
    Object.entries(stepErrorsMetric.values || {}).forEach(([k, v]) => {
      // k looks like '{"step":"step-3"}' in k6 >= 0.43
      try {
        const parsed = JSON.parse(k);
        if (parsed.step) perStep[parsed.step] = v;
      } catch (_) { /* plain key */ }
    });

    for (let i = 1; i <= 10; i++) {
      const label = `step-${i}`;
      if ((perStep[label] || 0) > 0) {
        breakingStep = label;
        break;
      }
    }
  }

  envelope.stress_meta = {
    profile:            PROFILE,
    steps:              PROFILE === 'ci' ? 4 : 10,
    step_duration_s:    PROFILE === 'ci' ? 15 : 30,
    peak_vus:           PROFILE === 'ci' ? 150 : 750,
    breaking_step:      breakingStep,    // null = did not break
    breaking_point_note: breakingStep
      ? `First errors observed at ${breakingStep} — see per-step latency in k6 output`
      : 'No breaking point reached within test parameters',
  };

  return {
    stdout:    textSummary(data, { indent: ' ', enableColors: true }),
    [outFile]: JSON.stringify(envelope, null, 2),
  };
}
