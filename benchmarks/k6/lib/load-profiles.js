/**
 * benchmarks/k6/lib/load-profiles.js
 *
 * Stage 3 load-test profiles: steady-load, spike, stress.
 *
 * Each export is an object with:
 *   stages   — k6 stages[] array (passed directly to options.stages)
 *   timing   — { warmup, rampUp, sustained, ... } in seconds
 *              (used by currentStage() in metrics.js)
 *   thresholds — k6 threshold object appropriate for that scenario
 *   meta       — human-readable description fields
 *
 * VU ↔ RPS relationship (loopback echo server, ~0 think time)
 * ──────────────────────────────────────────────────────────
 *   At sub-millisecond response times, 1 VU ≈ 500–1000 iterations/s.
 *   To target a specific RPS with a loopback server we dial VUs conservatively
 *   and let k6's arrival-rate executor (scenarios key) do exact RPS control.
 *
 *   For steady/spike/stress we use the simpler stages[] ramp model so the
 *   scripts are self-contained and easy to run ad-hoc.  The arrival-rate
 *   executor variant is provided as STEADY_ARRIVAL for users who need
 *   exact RPS numbers (requires k6 ≥ 0.43).
 */

// ── Steady Load ───────────────────────────────────────────────────────────────
//
// Goal: confirm the system delivers stable latency across the full RPS range
//       from light (100 RPS equiv) to production peak (1000 RPS equiv).
//
// Shape:
//   0 ──── 30 s ──── warmup (10 VUs — system initialises connections)
//   30 ──── 90 s ──── linear ramp 10 → 100 VUs  (~100 → 1000 RPS)
//   90 ──── 210 s ── sustained 100 VUs (primary measurement window)
//   210 ─── 240 s ── ramp-down 100 → 0

export const STEADY_STAGES = [
  { duration: '30s',  target: 10  },   // warmup
  { duration: '60s',  target: 100 },   // ramp 100 → 1000 RPS equiv
  { duration: '120s', target: 100 },   // sustained ← measurement window
  { duration: '30s',  target: 0   },   // drain
];

export const STEADY_TIMING = {
  warmup:    30,
  rampUp:    60,
  sustained: 120,
  rampDown:  30,
};

// Exact-arrival-rate variant (constant_arrival_rate executor)
// Ramps from 100 RPS to 1000 RPS over 120 s, holds 120 s, drains.
// Use:  export const options = { scenarios: STEADY_ARRIVAL }
export const STEADY_ARRIVAL = {
  steady_ramp: {
    executor:            'ramping-arrival-rate',
    startRate:           100,
    timeUnit:            '1s',
    preAllocatedVUs:     50,
    maxVUs:              200,
    stages: [
      { duration: '30s',  target: 100  },  // warmup at 100 RPS
      { duration: '90s',  target: 1000 },  // ramp to 1000 RPS
      { duration: '120s', target: 1000 },  // hold
      { duration: '30s',  target: 0    },  // drain
    ],
  },
};

export const STEADY_THRESHOLDS = {
  // All latency measured at 1000 RPS should still meet SLA
  http_req_failed:                  [{ threshold: 'rate<0.001',   abortOnFail: true  }],
  'http_req_duration{stage:sustained}': [
    { threshold: 'p(95)<50',   abortOnFail: false },
    { threshold: 'p(99)<100',  abortOnFail: false },
    { threshold: 'p(99.9)<250',abortOnFail: false },
  ],
  // Abort immediately if error rate spikes above 5 % at any point
  http_req_failed: [
    { threshold: 'rate<0.001', abortOnFail: false },
    { threshold: 'rate<0.05',  abortOnFail: true  },
  ],
};

// CI-safe relaxed variant
export const STEADY_THRESHOLDS_CI = {
  http_req_failed:  [{ threshold: 'rate<0.01',   abortOnFail: true  }],
  http_req_duration:[
    { threshold: 'p(95)<150',  abortOnFail: false },
    { threshold: 'p(99)<300',  abortOnFail: false },
  ],
};

// ── Spike ─────────────────────────────────────────────────────────────────────
//
// Goal: verify the system does NOT error under sudden traffic doubling and
//       that latency recovers to baseline within SPIKE_RECOVERY_S seconds.
//
// Shape:
//   0 ──── 60 s ──── baseline at 50 VUs (normal load)
//   60 ──── 62 s ──── spike: 50 → 500 VUs in 2 s   (10× burst)
//   62 ──── 122 s ─── hold spike load 120 s
//   122 ─── 124 s ─── drop: 500 → 50 VUs in 2 s    (recovery)
//   124 ─── 184 s ─── post-spike at 50 VUs          (recovery window)
//   184 ─── 194 s ─── ramp-down
//
// SPIKE_RECOVERY_S: max seconds after drop before p95 must be ≤ pre-spike p95.
// Checked in handleSummary via the post-spike stage tag.

export const SPIKE_RECOVERY_S = 30;

export const SPIKE_STAGES = [
  { duration: '60s',  target: 50  },   // pre-spike baseline
  { duration: '2s',   target: 500 },   // spike onset  (10× burst)
  { duration: '120s', target: 500 },   // hold spike
  { duration: '2s',   target: 50  },   // spike drop   (recovery onset)
  { duration: '60s',  target: 50  },   // post-spike recovery window
  { duration: '10s',  target: 0   },   // drain
];

export const SPIKE_TIMING = {
  baseline:    60,
  spikeOnset:  2,
  spikeHold:   120,
  spikeDrop:   2,
  recovery:    60,
  drain:       10,
};

export const SPIKE_THRESHOLDS = {
  // During the spike hold, errors must stay below 1 %
  http_req_failed: [
    { threshold: 'rate<0.01',  abortOnFail: false },
    { threshold: 'rate<0.05',  abortOnFail: true  },   // hard abort at 5 %
  ],
  // Overall p99 may be wide during spike but must come back down
  http_req_duration: [
    { threshold: 'p(99)<500',  abortOnFail: false },   // spike tolerance
  ],
  // Post-spike recovery: p95 must return to near-normal
  'http_req_duration{stage:post-spike}': [
    { threshold: 'p(95)<100',  abortOnFail: false },
    { threshold: 'p(99)<200',  abortOnFail: false },
  ],
  // Pre-spike baseline must be clean
  'http_req_duration{stage:pre-spike}': [
    { threshold: 'p(95)<50',   abortOnFail: false },
    { threshold: 'p(99)<100',  abortOnFail: false },
  ],
};

// CI-safe spike (shorter, lower peak)
export const SPIKE_STAGES_CI = [
  { duration: '20s',  target: 20  },   // pre-spike baseline
  { duration: '2s',   target: 200 },   // spike onset  (10× burst)
  { duration: '30s',  target: 200 },   // hold
  { duration: '2s',   target: 20  },   // drop
  { duration: '20s',  target: 20  },   // recovery
  { duration: '5s',   target: 0   },   // drain
];

export const SPIKE_TIMING_CI = {
  baseline:    20,
  spikeOnset:  2,
  spikeHold:   30,
  spikeDrop:   2,
  recovery:    20,
  drain:       5,
};

// ── Stress ────────────────────────────────────────────────────────────────────
//
// Goal: find the system's breaking point — the VU/RPS level at which
//       error rate exceeds 1 % or p99 exceeds 500 ms.
//
// Shape (staircase):
//   Each step adds 50 VUs and holds for 30 s.
//   Steps run until abortOnFail triggers or the staircase completes.
//   A final 30-s drain verifies the system recovers after overload.
//
//   Step  VUs   RPS equiv   Duration
//   ───── ───── ─────────── ────────
//    1     50   ~500        30 s
//    2    100   ~1 000      30 s
//    3    150   ~1 500      30 s
//    4    200   ~2 000      30 s
//    5    250   ~2 500      30 s
//    6    300   ~3 000      30 s
//    7    400   ~4 000      30 s
//    8    500   ~5 000      30 s   ← expected break zone
//    9    600   ~6 000      30 s
//   10    750   ~7 500      30 s
//   drain   0               30 s

export const STRESS_STAGES = [
  { duration: '30s',  target: 50  },   // step 1
  { duration: '30s',  target: 100 },   // step 2
  { duration: '30s',  target: 150 },   // step 3
  { duration: '30s',  target: 200 },   // step 4
  { duration: '30s',  target: 250 },   // step 5
  { duration: '30s',  target: 300 },   // step 6
  { duration: '30s',  target: 400 },   // step 7
  { duration: '30s',  target: 500 },   // step 8
  { duration: '30s',  target: 600 },   // step 9
  { duration: '30s',  target: 750 },   // step 10
  { duration: '30s',  target: 0   },   // drain — verify recovery
];

export const STRESS_TIMING = {
  // Not used for stage detection — stress uses staircase labels
  stepDuration: 30,
  steps: 10,
};

// Stress thresholds: the run is EXPECTED to eventually breach these —
// abortOnFail stops the run at the first step where errors are unrecoverable.
export const STRESS_THRESHOLDS = {
  http_req_failed: [
    { threshold: 'rate<0.01',  abortOnFail: false },   // 1 % — note the step in report
    { threshold: 'rate<0.10',  abortOnFail: true  },   // 10 % — abort: system broken
  ],
  http_req_duration: [
    { threshold: 'p(99)<500',  abortOnFail: false },   // note when breached
    { threshold: 'p(99)<2000', abortOnFail: true  },   // 2 s p99 — abort
  ],
};

// CI-safe stress (fewer steps, lower ceiling — never expected to break)
export const STRESS_STAGES_CI = [
  { duration: '15s',  target: 20  },
  { duration: '15s',  target: 50  },
  { duration: '15s',  target: 100 },
  { duration: '15s',  target: 150 },
  { duration: '15s',  target: 0   },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * stressStepLabel(elapsedMs)
 *
 * Returns a short label for the current staircase step, e.g. 'step-3'.
 * Used as a k6 tag so each step's latency is reported separately.
 *
 * @param {number} elapsedMs - milliseconds since scenario start
 * @param {number} stepMs    - duration of each step in ms (default 30 000)
 * @returns {string}
 */
export function stressStepLabel(elapsedMs, stepMs = 30_000) {
  const step = Math.min(Math.floor(elapsedMs / stepMs) + 1, 10);
  return `step-${step}`;
}

/**
 * spikeStageLabel(elapsedMs)
 *
 * Returns the current spike stage name as a string.
 * Must match SPIKE_TIMING / SPIKE_TIMING_CI cumulative durations.
 *
 * @param {number} elapsedMs
 * @param {object} timing  - SPIKE_TIMING or SPIKE_TIMING_CI
 * @returns {'pre-spike'|'spike-onset'|'spike-hold'|'spike-drop'|'post-spike'|'drain'}
 */
export function spikeStageLabel(elapsedMs, timing) {
  const s = elapsedMs / 1000;
  const t = timing;
  if (s < t.baseline)                                          return 'pre-spike';
  if (s < t.baseline + t.spikeOnset)                          return 'spike-onset';
  if (s < t.baseline + t.spikeOnset + t.spikeHold)            return 'spike-hold';
  if (s < t.baseline + t.spikeOnset + t.spikeHold + t.spikeDrop) return 'spike-drop';
  if (s < t.baseline + t.spikeOnset + t.spikeHold +
          t.spikeDrop + t.recovery)                           return 'post-spike';
  return 'drain';
}
