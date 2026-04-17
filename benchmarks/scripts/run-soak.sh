#!/usr/bin/env bash
# benchmarks/scripts/run-soak.sh
#
# Stage 6 — Soak test runner.
#
# Starts the required services, runs the k6 soak scenario for the
# requested duration, collects system metrics, and generates a report.
#
# Usage
# ─────
#   ./benchmarks/scripts/run-soak.sh [1h|6h|24h|smoke]
#
# Prerequisites
# ─────────────
#   - k6        (https://k6.io/docs/get-started/installation/)
#   - curl      (for health checks)
#   - node      >= 18
#   - The echo server binary or container running on :9000
#   - FlexGate running on :8080 (or set FLEXGATE_PID / FLEXGATE_URL)
#
# Environment overrides
# ─────────────────────
#   FLEXGATE_PID      PID of a running FlexGate process to monitor
#                     (if unset, the script attempts to find it via pgrep)
#   FLEXGATE_URL      FlexGate base URL (default: http://localhost:8080)
#   ECHO_URL          Echo server URL   (default: http://localhost:9000)
#   SKIP_SERVICES     Set to 1 to skip starting echo/FlexGate (use existing)
#   K6_BIN            Path to k6 binary (default: k6)
#   RESULTS_BASE      Base directory for results (default: benchmarks/results)
#   LABEL             Human-readable label appended to run directory name
#
# Exit codes
#   0  — all checks pass
#   1  — soak verdict FAIL (leak/crash/threshold)
#   2  — dependency missing or bad argument
#   3  — FlexGate failed to start

set -euo pipefail

# ── Constants ─────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BENCH_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$BENCH_DIR/.." && pwd)"

K6_SCENARIO="$BENCH_DIR/k6/scenarios/soak.js"
SOAK_MONITOR="$SCRIPT_DIR/soak-monitor.sh"
SOAK_REPORT="$SCRIPT_DIR/soak-report.js"

K6_BIN="${K6_BIN:-k6}"
FLEXGATE_URL="${FLEXGATE_URL:-http://localhost:8080}"
ECHO_URL="${ECHO_URL:-http://localhost:9000}"
RESULTS_BASE="${RESULTS_BASE:-$BENCH_DIR/results}"
LABEL="${LABEL:-}"
SKIP_SERVICES="${SKIP_SERVICES:-0}"

# ── Argument ──────────────────────────────────────────────────────────────────

SOAK_PROFILE="${1:-smoke}"

case "$SOAK_PROFILE" in
  smoke|1h|6h|24h) ;;
  *)
    echo "Usage: $0 [smoke|1h|6h|24h]" >&2
    echo "  smoke — 5-minute CI smoke run (default)" >&2
    echo "  1h    — 1-hour soak" >&2
    echo "  6h    — 6-hour soak" >&2
    echo "  24h   — 24-hour soak" >&2
    exit 2
    ;;
esac

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
  echo "ERROR: Install missing dependencies before running soak tests." >&2
  exit 2
fi
echo "  OK"

# ── Run directory ─────────────────────────────────────────────────────────────

TS="$(date +%Y%m%d-%H%M%S)"
LABEL_SLUG="${LABEL:+-${LABEL}}"
RUN_DIR="$RESULTS_BASE/soak-${SOAK_PROFILE}-${TS}${LABEL_SLUG}"
mkdir -p "$RUN_DIR/logs"

RESULT_FILE="$RUN_DIR/soak-result.json"
MONITOR_JSONL="$RUN_DIR/logs/monitor.jsonl"
RUNNER_LOG="$RUN_DIR/logs/runner.log"
K6_LOG="$RUN_DIR/logs/k6.log"

exec > >(tee -a "$RUNNER_LOG") 2>&1

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  FLEXGATE SOAK TEST — profile: $SOAK_PROFILE"
echo "║  Run dir: $RUN_DIR"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Started: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo ""

# ── Cleanup trap ──────────────────────────────────────────────────────────────

MONITOR_PID=""
FLEXGATE_PID_STARTED=""

cleanup() {
  echo ""
  echo "==> Cleaning up..."
  if [[ -n "$MONITOR_PID" ]] && kill -0 "$MONITOR_PID" 2>/dev/null; then
    kill "$MONITOR_PID" 2>/dev/null || true
    echo "  Stopped soak-monitor (PID $MONITOR_PID)"
  fi
  # Do NOT stop FlexGate if SKIP_SERVICES=1 (pre-existing process)
  if [[ -n "$FLEXGATE_PID_STARTED" ]] && kill -0 "$FLEXGATE_PID_STARTED" 2>/dev/null; then
    kill "$FLEXGATE_PID_STARTED" 2>/dev/null || true
    echo "  Stopped FlexGate (PID $FLEXGATE_PID_STARTED)"
  fi
}
trap cleanup EXIT

# ── Step 1: Start services (if not already running) ───────────────────────────

echo "── STEP 1: Services ─────────────────────────────────────────────"

if [[ "$SKIP_SERVICES" == "1" ]]; then
  echo "  SKIP_SERVICES=1 — using pre-existing services"
else
  # Check if echo server is up
  if curl -sf "${ECHO_URL}/health" -o /dev/null 2>/dev/null; then
    echo "  Echo server already running at $ECHO_URL"
  else
    echo "  WARNING: Echo server not found at $ECHO_URL" >&2
    echo "  Start it with: cd benchmarks/targets/echo-server && go run main.go -addr :9000"
    echo "  Or set SKIP_SERVICES=1 to skip this check."
  fi

  # Check if FlexGate is up
  if curl -sf "${FLEXGATE_URL}/api/health" -o /dev/null 2>/dev/null; then
    echo "  FlexGate already running at $FLEXGATE_URL"
  else
    echo "  Attempting to start FlexGate..."
    cd "$REPO_ROOT"
    if [[ -f "$REPO_ROOT/bin/www" ]]; then
      NODE_ENV=production node bin/www &
      FLEXGATE_PID_STARTED=$!
      echo "  FlexGate starting (PID $FLEXGATE_PID_STARTED)..."
      sleep 5
      if ! kill -0 "$FLEXGATE_PID_STARTED" 2>/dev/null; then
        echo "ERROR: FlexGate failed to start." >&2
        exit 3
      fi
      if ! curl -sf "${FLEXGATE_URL}/api/health" -o /dev/null 2>/dev/null; then
        echo "ERROR: FlexGate started but health check failed." >&2
        exit 3
      fi
      echo "  FlexGate running (PID $FLEXGATE_PID_STARTED)"
    else
      echo "  WARNING: Cannot find bin/www — set SKIP_SERVICES=1 and start FlexGate manually"
    fi
  fi
fi

# ── Step 2: Find FlexGate PID ─────────────────────────────────────────────────

echo ""
echo "── STEP 2: Locate FlexGate process ─────────────────────────────"

TARGET_PID=""
if [[ -n "${FLEXGATE_PID:-}" ]]; then
  TARGET_PID="$FLEXGATE_PID"
  echo "  Using FLEXGATE_PID=$TARGET_PID"
elif [[ -n "$FLEXGATE_PID_STARTED" ]]; then
  TARGET_PID="$FLEXGATE_PID_STARTED"
  echo "  Using started PID=$TARGET_PID"
else
  # Try pgrep — look for node process serving port 8080
  FOUND="$(pgrep -f 'bin/www\|node.*flexgate\|node.*app\.js' 2>/dev/null | head -1 || true)"
  if [[ -n "$FOUND" ]]; then
    TARGET_PID="$FOUND"
    echo "  Found FlexGate PID via pgrep: $TARGET_PID"
  else
    echo "  WARNING: Cannot determine FlexGate PID — soak-monitor will run without process tracking"
    echo "  Set FLEXGATE_PID=<pid> to enable memory/CPU/FD monitoring"
    TARGET_PID="1"  # Fallback: monitor init (always alive), meaningful data will be 0
  fi
fi

# ── Step 3: Start soak-monitor ────────────────────────────────────────────────

echo ""
echo "── STEP 3: Start soak-monitor ───────────────────────────────────"

# Determine monitor interval based on profile
case "$SOAK_PROFILE" in
  smoke)  MONITOR_INTERVAL=5  ;;
  1h)     MONITOR_INTERVAL=5  ;;
  6h)     MONITOR_INTERVAL=15 ;;
  24h)    MONITOR_INTERVAL=30 ;;
esac

chmod +x "$SOAK_MONITOR"
"$SOAK_MONITOR" "$TARGET_PID" "$MONITOR_JSONL" "$MONITOR_INTERVAL" "${FLEXGATE_URL}/api/health" &
MONITOR_PID=$!
echo "  soak-monitor started (PID $MONITOR_PID, interval ${MONITOR_INTERVAL}s)"
echo "  Output: $MONITOR_JSONL"

# ── Step 4: Run k6 soak scenario ─────────────────────────────────────────────

echo ""
echo "── STEP 4: k6 soak scenario ─────────────────────────────────────"
echo "  Profile: $SOAK_PROFILE"
echo "  Target:  $FLEXGATE_URL"
echo "  Result:  $RESULT_FILE"
echo ""

K6_EXIT=0
"$K6_BIN" run \
  --env SOAK_PROFILE="$SOAK_PROFILE" \
  --env BASE_URL="$FLEXGATE_URL" \
  --env RESULT_FILE="$RESULT_FILE" \
  --env LABEL="${LABEL:-}" \
  --out "json=${RUN_DIR}/logs/k6-raw.json" \
  --log-output "file=${K6_LOG}" \
  "$K6_SCENARIO" \
  || K6_EXIT=$?

echo ""
if [[ "$K6_EXIT" == "0" ]]; then
  echo "  k6 finished successfully (exit 0)"
else
  echo "  k6 finished with exit code $K6_EXIT (thresholds may have failed)"
fi

# ── Step 5: Stop soak-monitor ────────────────────────────────────────────────

echo ""
echo "── STEP 5: Stop soak-monitor ────────────────────────────────────"
if [[ -n "$MONITOR_PID" ]] && kill -0 "$MONITOR_PID" 2>/dev/null; then
  kill "$MONITOR_PID" 2>/dev/null || true
  wait "$MONITOR_PID" 2>/dev/null || true
  MONITOR_PID=""
  echo "  Stopped"
else
  echo "  Already stopped"
fi

SAMPLE_COUNT=0
if [[ -f "$MONITOR_JSONL" ]]; then
  SAMPLE_COUNT="$(wc -l < "$MONITOR_JSONL" | tr -d ' ')"
fi
echo "  Monitor samples: $SAMPLE_COUNT"

# ── Step 6: Generate soak report ─────────────────────────────────────────────

echo ""
echo "── STEP 6: Generate soak report ────────────────────────────────"

REPORT_EXIT=0
if [[ -f "$RESULT_FILE" ]] && [[ -f "$MONITOR_JSONL" ]]; then
  node "$SOAK_REPORT" \
    --result   "$RESULT_FILE" \
    --monitor  "$MONITOR_JSONL" \
    --out-dir  "$RUN_DIR" \
    --stdout \
    || REPORT_EXIT=$?
else
  if [[ ! -f "$RESULT_FILE" ]]; then
    echo "  WARNING: k6 result file not found: $RESULT_FILE" >&2
  fi
  if [[ ! -f "$MONITOR_JSONL" ]]; then
    echo "  WARNING: Monitor JSONL not found: $MONITOR_JSONL" >&2
  fi
  REPORT_EXIT=1
fi

# ── Step 7: Write run manifest ────────────────────────────────────────────────

echo ""
echo "── STEP 7: Write manifest ───────────────────────────────────────"

SOAK_VERDICT="UNKNOWN"
if [[ -f "$RUN_DIR/soak-summary.json" ]]; then
  SOAK_VERDICT="$(node -e "
    const s = require('$RUN_DIR/soak-summary.json');
    process.stdout.write(s.verdicts?.overall || 'UNKNOWN');
  " 2>/dev/null || echo 'UNKNOWN')"
fi

node -e "
const manifest = {
  schema_version: 1,
  generated_at:   new Date().toISOString(),
  soak_profile:   '$SOAK_PROFILE',
  run_dir:        '$RUN_DIR',
  run_label:      '${LABEL:-}',
  flexgate_url:   '$FLEXGATE_URL',
  k6_exit_code:   $K6_EXIT,
  report_exit:    $REPORT_EXIT,
  verdict:        '$SOAK_VERDICT',
  files: {
    k6_result:      'soak-result.json',
    monitor_jsonl:  'logs/monitor.jsonl',
    k6_raw:         'logs/k6-raw.json',
    k6_log:         'logs/k6.log',
    runner_log:     'logs/runner.log',
    summary:        'soak-summary.json',
    report:         'soak-report.md',
  },
};
require('fs').writeFileSync('$RUN_DIR/manifest.json', JSON.stringify(manifest, null, 2));
console.log('  Written: $RUN_DIR/manifest.json');
"

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "══════════════════════════════════════════════════════════════════"
echo "  Soak run complete"
echo "  Profile:  $SOAK_PROFILE"
echo "  Verdict:  $SOAK_VERDICT"
echo "  Run dir:  $RUN_DIR"
echo "  Report:   $RUN_DIR/soak-report.md"
echo "  Summary:  $RUN_DIR/soak-summary.json"
echo "══════════════════════════════════════════════════════════════════"
echo ""

# ── Exit code ─────────────────────────────────────────────────────────────────

if [[ "$SOAK_VERDICT" == "PASS" ]]; then
  exit 0
elif [[ "$SOAK_VERDICT" == "FAIL" ]]; then
  exit 1
else
  # Verdict unknown — use report exit code
  exit "$REPORT_EXIT"
fi
