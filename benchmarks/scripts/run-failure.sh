#!/usr/bin/env bash
# benchmarks/scripts/run-failure.sh
#
# Stage 7 — Failure / Resilience test runner.
#
# Orchestrates all four fault scenarios against a running FlexGate instance:
#
#   1. backend-down   upstream refuses connections entirely
#   2. slow-backend   upstream delays every response by SLOW_DELAY_MS
#   3. timeout        upstream hangs until FlexGate's per-request timeout fires
#   4. redis-down     Redis is unavailable (rate-limit fail-open)
#
# For each scenario the test has three phases:
#   baseline  (30 s) — healthy traffic; establishes the error-rate/latency floor
#   fault     (60 s) — fault is ACTIVE via the fault-server control plane
#   recovery  (30 s) — fault is removed; system must self-heal
#
# Usage
# ─────
#   ./benchmarks/scripts/run-failure.sh [SCENARIO]
#
#   SCENARIO may be: backend-down | slow-backend | timeout | redis-down | all
#   Default: all
#
# Prerequisites
# ─────────────
#   - k6         (https://k6.io/docs/get-started/installation/)
#   - Go toolchain (to build fault-server on first run)
#   - curl, node >= 18
#   - FlexGate running on :8080 (or set FLEXGATE_URL)
#   - Redis running on :6379 (for redis-down test; set REDIS_URL to skip)
#
# Environment overrides
# ─────────────────────
#   FLEXGATE_URL    FlexGate base URL (default: http://localhost:8080)
#   FAULT_SERVER_ADDR   fault-server data-plane port (default: :9008)
#   FAULT_CTRL_ADDR     fault-server control-plane port (default: :9099)
#   SLOW_DELAY_MS   upstream delay for slow-backend scenario (default: 800)
#   REDIS_URL       Redis URL for redis-down test (default: redis://localhost:6379)
#   RESULTS_BASE    results directory (default: benchmarks/results)
#   K6_BIN          k6 binary path (default: k6)
#   LABEL           human-readable label appended to run directory
#   SKIP_BUILD      set to 1 to skip rebuilding fault-server
#
# Exit codes
#   0  — all selected scenarios pass
#   1  — one or more scenarios fail
#   2  — dependency missing or bad argument

set -euo pipefail

# ── Paths ─────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BENCH_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$BENCH_DIR/.." && pwd)"

FAULT_SERVER_SRC="$BENCH_DIR/targets/fault-server"
FAULT_SERVER_BIN="$FAULT_SERVER_SRC/fault-server"
K6_SCENARIO="$BENCH_DIR/k6/scenarios/failure.js"
FAILURE_REPORT_JS="$SCRIPT_DIR/failure-report.js"

K6_BIN="${K6_BIN:-k6}"
FLEXGATE_URL="${FLEXGATE_URL:-http://localhost:8080}"
FAULT_SERVER_ADDR="${FAULT_SERVER_ADDR:-:9008}"
FAULT_CTRL_ADDR="${FAULT_CTRL_ADDR:-:9099}"
SLOW_DELAY_MS="${SLOW_DELAY_MS:-800}"
REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
RESULTS_BASE="${RESULTS_BASE:-$BENCH_DIR/results}"
LABEL="${LABEL:-}"
SKIP_BUILD="${SKIP_BUILD:-0}"

# Fault-server host (strip the colon-only addr format)
FAULT_HOST="http://localhost${FAULT_CTRL_ADDR}"

# ── Argument ──────────────────────────────────────────────────────────────────

RUN_SCENARIO="${1:-all}"

case "$RUN_SCENARIO" in
  backend-down|slow-backend|timeout|redis-down|all) ;;
  *)
    echo "Usage: $0 [backend-down|slow-backend|timeout|redis-down|all]" >&2
    exit 2
    ;;
esac

if [[ "$RUN_SCENARIO" == "all" ]]; then
  SCENARIOS=(backend-down slow-backend timeout redis-down)
else
  SCENARIOS=("$RUN_SCENARIO")
fi

# ── Dependency checks ─────────────────────────────────────────────────────────

echo "==> Checking dependencies..."
MISSING=0
for cmd in "$K6_BIN" node curl; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "  MISSING: $cmd" >&2
    MISSING=1
  fi
done
if [[ "$MISSING" == "1" ]]; then
  echo "ERROR: Install missing dependencies." >&2
  exit 2
fi
echo "  OK"

# ── Build fault-server ────────────────────────────────────────────────────────

if [[ "$SKIP_BUILD" != "1" ]]; then
  echo "==> Building fault-server..."
  if ! command -v go &>/dev/null; then
    echo "  WARNING: go not found — fault-server not built." >&2
    echo "  Set SKIP_BUILD=1 if fault-server binary already exists." >&2
  else
    (cd "$REPO_ROOT" && go build -o "$FAULT_SERVER_BIN" ./benchmarks/targets/fault-server/)
    echo "  Built: $FAULT_SERVER_BIN"
  fi
fi

if [[ ! -x "$FAULT_SERVER_BIN" ]]; then
  echo "ERROR: fault-server binary not found at $FAULT_SERVER_BIN" >&2
  echo "  Build with: cd $REPO_ROOT && go build -o $FAULT_SERVER_BIN ./benchmarks/targets/fault-server/" >&2
  exit 2
fi

# ── Run directory ─────────────────────────────────────────────────────────────

TS="$(date +%Y%m%d-%H%M%S)"
LABEL_SLUG="${LABEL:+-${LABEL}}"
RUN_DIR="$RESULTS_BASE/failure-${TS}${LABEL_SLUG}"
mkdir -p "$RUN_DIR/logs"

RUNNER_LOG="$RUN_DIR/logs/runner.log"
exec > >(tee -a "$RUNNER_LOG") 2>&1

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  FLEXGATE FAILURE TESTS — Stage 7"
echo "║  Scenarios: ${SCENARIOS[*]}"
echo "║  Run dir: $RUN_DIR"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Started: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo ""

# ── Cleanup trap ──────────────────────────────────────────────────────────────

FAULT_SERVER_PID=""

cleanup() {
  echo ""
  echo "==> Cleanup..."
  if [[ -n "$FAULT_SERVER_PID" ]] && kill -0 "$FAULT_SERVER_PID" 2>/dev/null; then
    kill "$FAULT_SERVER_PID" 2>/dev/null || true
    echo "  Stopped fault-server (PID $FAULT_SERVER_PID)"
  fi
  # Restore Redis if needed (scenario redis-down)
  if [[ -f "$RUN_DIR/.redis-blocked" ]]; then
    echo "  NOTE: Redis may still be blocked — check iptables if needed" >&2
  fi
}
trap cleanup EXIT

# ── Start fault-server ────────────────────────────────────────────────────────

echo "── Starting fault-server ───────────────────────────────────────"
"$FAULT_SERVER_BIN" \
  -addr "$FAULT_SERVER_ADDR" \
  -ctrl-addr "$FAULT_CTRL_ADDR" \
  -mode healthy \
  -delay "$SLOW_DELAY_MS" \
  >> "$RUN_DIR/logs/fault-server.log" 2>&1 &
FAULT_SERVER_PID=$!
echo "  PID $FAULT_SERVER_PID  data=$FAULT_SERVER_ADDR  ctrl=$FAULT_CTRL_ADDR"

# Wait for fault-server to be ready
for i in $(seq 1 10); do
  if curl -sf "${FAULT_HOST}/fault/status" -o /dev/null 2>/dev/null; then
    echo "  Ready"
    break
  fi
  sleep 0.5
  if [[ "$i" == "10" ]]; then
    echo "ERROR: fault-server did not start in time" >&2
    exit 2
  fi
done

# ── Helper: set fault mode via control plane ──────────────────────────────────

set_fault_mode() {
  local mode="$1"
  curl -sf -X POST "${FAULT_HOST}/fault/set?mode=${mode}" -o /dev/null
  echo "  [fault-ctrl] mode set to: ${mode}"
}

reset_fault() {
  curl -sf -X POST "${FAULT_HOST}/fault/reset" -o /dev/null
  echo "  [fault-ctrl] mode reset to: healthy"
}

# ── Helper: block/unblock Redis with iptables (redis-down scenario) ───────────

block_redis() {
  # Strategy: add an iptables OUTPUT rule to DROP packets to the Redis port.
  # This simulates a Redis crash from FlexGate's perspective.
  # Falls back to a "kill redis" approach if iptables is not available.
  local redis_port="${REDIS_URL##*:}"
  redis_port="${redis_port:-6379}"

  if command -v iptables &>/dev/null && [[ "$(uname -s)" == "Linux" ]]; then
    iptables -A OUTPUT -p tcp --dport "$redis_port" -j DROP 2>/dev/null || true
    touch "$RUN_DIR/.redis-blocked"
    echo "  [redis] iptables DROP rule added for port $redis_port"
  else
    echo "  [redis] iptables not available on $(uname -s) — using SIGSTOP on redis-server"
    REDIS_PID="$(pgrep redis-server 2>/dev/null | head -1 || echo '')"
    if [[ -n "$REDIS_PID" ]]; then
      kill -STOP "$REDIS_PID"
      echo "  [redis] Sent SIGSTOP to redis-server PID $REDIS_PID"
      echo "$REDIS_PID" > "$RUN_DIR/.redis-stopped-pid"
    else
      echo "  [redis] WARNING: redis-server process not found — redis-down test may not work" >&2
    fi
  fi
}

unblock_redis() {
  local redis_port="${REDIS_URL##*:}"
  redis_port="${redis_port:-6379}"

  if [[ -f "$RUN_DIR/.redis-blocked" ]]; then
    iptables -D OUTPUT -p tcp --dport "$redis_port" -j DROP 2>/dev/null || true
    rm -f "$RUN_DIR/.redis-blocked"
    echo "  [redis] iptables DROP rule removed"
  fi

  if [[ -f "$RUN_DIR/.redis-stopped-pid" ]]; then
    local pid
    pid="$(cat "$RUN_DIR/.redis-stopped-pid")"
    kill -CONT "$pid" 2>/dev/null || true
    rm -f "$RUN_DIR/.redis-stopped-pid"
    echo "  [redis] Sent SIGCONT to redis-server PID $pid"
  fi
}

# ── Verify FlexGate is healthy ────────────────────────────────────────────────

echo ""
echo "── Pre-flight check ────────────────────────────────────────────"
if ! curl -sf "${FLEXGATE_URL}/health" -o /dev/null 2>/dev/null; then
  echo "ERROR: FlexGate not reachable at $FLEXGATE_URL" >&2
  exit 2
fi
echo "  FlexGate healthy at $FLEXGATE_URL"

# ── Run scenarios ─────────────────────────────────────────────────────────────

declare -A SCENARIO_VERDICTS

run_scenario() {
  local scenario="$1"
  local result_file="$RUN_DIR/${scenario}-result.json"
  local k6_log="$RUN_DIR/logs/k6-${scenario}.log"

  echo ""
  echo "══════════════════════════════════════════════════════════════"
  echo "  Scenario: $scenario"
  echo "══════════════════════════════════════════════════════════════"

  # Phase timing (seconds)
  local baseline_s=30
  local fault_s=60
  local recovery_s=30

  # ── Pre-run: ensure fault server is in healthy mode ──────────────────────
  reset_fault
  sleep 2

  # ── k6 phase control ─────────────────────────────────────────────────────
  # k6 runs the full test (baseline + fault + recovery) as one continuous run.
  # We need to switch the fault mode at the right moment.
  # Strategy: start k6 in background, sleep for baseline phase, inject fault,
  # sleep for fault phase, remove fault, let recovery complete.

  # Reconfigure FlexGate to use the fault-server as upstream for this scenario
  # (in a real integration this would be done via the admin API; for testing we
  # use an env var that the failure.js scenario uses to target the fault-server).
  local fault_port="${FAULT_SERVER_ADDR#:}"
  local target_url="http://localhost:${fault_port}"

  echo "  Starting k6..."
  "$K6_BIN" run \
    --env FAULT_SCENARIO="$scenario" \
    --env BASE_URL="$FLEXGATE_URL" \
    --env TARGET_URL="$target_url" \
    --env RESULT_FILE="$result_file" \
    --env LABEL="$LABEL" \
    --out "json=${RUN_DIR}/logs/k6-${scenario}-raw.json" \
    --log-output "file=${k6_log}" \
    "$K6_SCENARIO" &
  local k6_pid=$!

  echo "  k6 PID: $k6_pid"

  # Wait for baseline phase to complete, then inject fault
  echo "  Waiting ${baseline_s}s for baseline phase..."
  sleep "$baseline_s"

  echo "  === Injecting fault: $scenario ==="
  case "$scenario" in
    backend-down)
      set_fault_mode "down"
      ;;
    slow-backend)
      set_fault_mode "slow"
      ;;
    timeout)
      set_fault_mode "timeout"
      ;;
    redis-down)
      block_redis
      ;;
  esac

  echo "  Fault active — waiting ${fault_s}s..."
  sleep "$fault_s"

  echo "  === Removing fault: $scenario ==="
  case "$scenario" in
    backend-down|slow-backend|timeout)
      reset_fault
      ;;
    redis-down)
      unblock_redis
      ;;
  esac

  echo "  Recovery phase — waiting ${recovery_s}s..."
  sleep "$recovery_s"

  # Wait for k6 to finish
  local k6_exit=0
  wait "$k6_pid" || k6_exit=$?
  echo "  k6 exit code: $k6_exit"

  # ── Generate scenario report ─────────────────────────────────────────────
  if [[ -f "$result_file" ]] && [[ -f "$FAILURE_REPORT_JS" ]]; then
    node "$FAILURE_REPORT_JS" \
      --result "$result_file" \
      --out-dir "$RUN_DIR" \
      --scenario "$scenario" \
      || true
  fi

  # Read verdict from result JSON
  local verdict="UNKNOWN"
  if [[ -f "$result_file" ]]; then
    verdict="$(node -e "
      const r = require('$result_file');
      process.stdout.write(r.failure_meta?.all_checks_pass ? 'PASS' : 'FAIL');
    " 2>/dev/null || echo 'UNKNOWN')"
  fi

  SCENARIO_VERDICTS["$scenario"]="$verdict"
  echo "  Verdict: $verdict"
}

for sc in "${SCENARIOS[@]}"; do
  run_scenario "$sc"
done

# ── Write manifest ────────────────────────────────────────────────────────────

echo ""
echo "── Writing manifest ────────────────────────────────────────────"

OVERALL="PASS"
for sc in "${SCENARIOS[@]}"; do
  if [[ "${SCENARIO_VERDICTS[$sc]:-UNKNOWN}" != "PASS" ]]; then
    OVERALL="FAIL"
  fi
done

node -e "
const verdicts = $(
  python3 -c "
import json, sys
d = {}
$(for sc in "${SCENARIOS[@]}"; do
    echo "d['$sc'] = '${SCENARIO_VERDICTS[$sc]:-UNKNOWN}'"
  done)
print(json.dumps(d))
"
);
const manifest = {
  schema_version: 1,
  generated_at:   new Date().toISOString(),
  run_dir:        '$RUN_DIR',
  run_label:      '${LABEL:-}',
  scenarios:      verdicts,
  overall:        '$OVERALL',
};
require('fs').writeFileSync('$RUN_DIR/manifest.json', JSON.stringify(manifest, null, 2));
console.log('  Written: $RUN_DIR/manifest.json');
"

echo ""
echo "══════════════════════════════════════════════════════════════════"
echo "  FAILURE TEST RESULTS"
echo "  Overall: $OVERALL"
echo ""
for sc in "${SCENARIOS[@]}"; do
  echo "  ${SCENARIO_VERDICTS[$sc]:-UNKNOWN}  $sc"
done
echo ""
echo "  Run dir: $RUN_DIR"
echo "══════════════════════════════════════════════════════════════════"
echo ""

if [[ "$OVERALL" == "PASS" ]]; then
  exit 0
else
  exit 1
fi
