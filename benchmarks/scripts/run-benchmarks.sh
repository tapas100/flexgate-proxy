#!/usr/bin/env bash
# benchmarks/scripts/run-benchmarks.sh
#
# ╔══════════════════════════════════════════════════════════════════════╗
# ║  FlexGate Benchmark Runner — Stage 4                                ║
# ║                                                                      ║
# ║  Fully automated end-to-end benchmark suite.                         ║
# ║  Starts every required process, runs all scenarios in order,         ║
# ║  collects & merges system metrics, stores canonical result files,    ║
# ║  generates a comparison report, then tears everything down cleanly.  ║
# ╚══════════════════════════════════════════════════════════════════════╝
#
# Usage
# ─────
#   bash benchmarks/scripts/run-benchmarks.sh [ci|full] [LABEL]
#
#   LABEL  — optional human-readable suffix for the run directory,
#            e.g. "pre-release-v1.2" → results/run-<ts>-pre-release-v1.2/
#            defaults to git branch name
#
# Environment variables
# ─────────────────────
#   FLEXGATE_BIN    path to flexgate binary        (default: ./flexgate)
#   FLEXGATE_CFG    path to bench config            (default: config/flexgate.bench.json)
#   PROFILE         ci | full                       (default: ci)
#   SKIP_SCENARIOS  space-separated names to skip   (default: "")
#   SKIP_STAGE3     1 = skip steady/spike/stress    (default: 0)
#   K6_EXTRA_ARGS   extra flags passed to every k6 run invocation
#
# Output
# ──────
#   benchmarks/results/run-<RUN_TS>-<LABEL>/
#   ├── manifest.json               ← run metadata + per-scenario status
#   ├── baseline.json               ← canonical result (schema v1)
#   ├── nginx.json
#   ├── haproxy.json
#   ├── flexgate-inline.json
#   ├── flexgate-mirror.json
#   ├── realistic.json              (Stage 2)
#   ├── steady-load.json            (Stage 3, unless SKIP_STAGE3=1)
#   ├── spike.json                  (Stage 3)
#   ├── stress.json                 (Stage 3)
#   ├── comparison.md               ← Markdown diff table (all scenarios)
#   └── logs/
#       ├── <scenario>-k6.log       ← raw k6 stdout/stderr
#       ├── <scenario>-system.jsonl ← CPU/RSS samples (1-s intervals)
#       └── runner.log              ← this script's output
#
# Exit codes
# ──────────
#   0  all required scenarios passed their thresholds
#   1  one or more scenarios failed, or a required process failed to start
#   2  missing dependency (k6, haproxy, nginx, go)
#
# Prerequisites
# ─────────────
#   brew install k6 haproxy nginx
#   go build -o benchmarks/targets/echo-server/echo-server \
#            ./benchmarks/targets/echo-server/

set -euo pipefail

# ── Paths ─────────────────────────────────────────────────────────────────────

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BENCH_DIR="$REPO_ROOT/benchmarks"
SCRIPTS_DIR="$BENCH_DIR/scripts"
TARGETS_DIR="$BENCH_DIR/targets"
K6_DIR="$BENCH_DIR/k6"

# ── Parameters ────────────────────────────────────────────────────────────────

PROFILE="${1:-${PROFILE:-ci}}"
USER_LABEL="${2:-}"

if [[ -z "$USER_LABEL" ]]; then
    USER_LABEL=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null \
                   | tr '/' '-' \
                   || echo "manual")
fi

FLEXGATE_BIN="${FLEXGATE_BIN:-$REPO_ROOT/flexgate}"
FLEXGATE_CFG="${FLEXGATE_CFG:-$REPO_ROOT/config/flexgate.bench.json}"
ECHO_BIN="$TARGETS_DIR/echo-server/echo-server"
K6_EXTRA_ARGS="${K6_EXTRA_ARGS:-}"

SKIP_SCENARIOS="${SKIP_SCENARIOS:-}"
SKIP_STAGE3="${SKIP_STAGE3:-0}"

# ── Run directory ─────────────────────────────────────────────────────────────

RUN_TS=$(date +%Y%m%d-%H%M%S)
RUN_ID="${RUN_TS}-${USER_LABEL}"
RUN_DIR="$BENCH_DIR/results/run-${RUN_ID}"
LOGS_DIR="$RUN_DIR/logs"

mkdir -p "$RUN_DIR" "$LOGS_DIR"

# All output is tee'd to runner.log AND the terminal
exec > >(tee -a "$LOGS_DIR/runner.log") 2>&1

# ── Ports ─────────────────────────────────────────────────────────────────────

ECHO_PORT=9000
NGINX_PORT=9001
HAPROXY_PORT=9002
FLEXGATE_INLINE_PORT=9003
FLEXGATE_MIRROR_PORT=9004
FLEXGATE_PROXY_PORT=8080
FLEXGATE_ADMIN_PORT=9090
REALISTIC_PORT=9006
ECHO_SLOW_PORT=9007

# ── Build metadata ────────────────────────────────────────────────────────────

GIT_SHA=$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
BENCH_OS=$(uname -srm)
BENCH_CPU=$(sysctl -n machdep.cpu.brand_string 2>/dev/null \
             || grep -m1 "model name" /proc/cpuinfo 2>/dev/null \
                | cut -d: -f2 | xargs \
             || echo "unknown")

# ── Colour helpers ────────────────────────────────────────────────────────────

BOLD="\033[1m"; CYAN="\033[36m"; GREEN="\033[32m"
YELLOW="\033[33m"; RED="\033[31m"; RESET="\033[0m"

info()    { echo -e "  ${CYAN}ℹ${RESET}  $*"; }
success() { echo -e "  ${GREEN}✔${RESET}  $*"; }
warn()    { echo -e "  ${YELLOW}⚠${RESET}  $*"; }
error()   { echo -e "  ${RED}✖${RESET}  $*" >&2; }
step()    { echo -e "\n${BOLD}${CYAN}── STEP $1 ──${RESET} $2"; }
banner()  {
    echo ""
    echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════╗${RESET}"
    echo -e "${BOLD}${CYAN}║${RESET}  $*"
    echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════╝${RESET}"
    echo ""
}

# ── Manifest (tracks per-scenario pass/fail) ──────────────────────────────────

MANIFEST_FILE="$RUN_DIR/manifest.json"
SCENARIO_STATUSES=()    # "scenario:status" pairs accumulated during the run
OVERALL_EXIT=0

manifest_init() {
    cat > "$MANIFEST_FILE" <<EOF
{
  "schema_version": 1,
  "run_id": "${RUN_ID}",
  "run_label": "${USER_LABEL}",
  "profile": "${PROFILE}",
  "git_sha": "${GIT_SHA}",
  "git_branch": "${GIT_BRANCH}",
  "hardware": {
    "os": "${BENCH_OS}",
    "cpu": "${BENCH_CPU}",
    "note": "single-node loopback — see ARCHITECTURE.md §3"
  },
  "started_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "finished_at": null,
  "scenarios": {}
}
EOF
}

manifest_record() {
    # manifest_record <scenario> <status> [result_file]
    local scenario="$1" status="$2" result_file="${3:-null}"
    SCENARIO_STATUSES+=("${scenario}:${status}")

    # Use python3 for in-place JSON update (jq may not be installed)
    python3 - "$MANIFEST_FILE" "$scenario" "$status" "$result_file" <<'PYEOF'
import json, sys
manifest_path, scenario, status, result_file = sys.argv[1:]
with open(manifest_path) as f:
    m = json.load(f)
m['scenarios'][scenario] = {
    'status': status,
    'result_file': result_file if result_file != 'null' else None,
}
with open(manifest_path, 'w') as f:
    json.dump(m, f, indent=2)
PYEOF
}

manifest_finish() {
    python3 - "$MANIFEST_FILE" <<'PYEOF'
import json, sys
from datetime import datetime, timezone
manifest_path = sys.argv[1]
with open(manifest_path) as f:
    m = json.load(f)
m['finished_at'] = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
# Compute overall status
statuses = [v['status'] for v in m['scenarios'].values()]
m['overall_status'] = 'pass' if all(s == 'pass' for s in statuses) else 'fail'
with open(manifest_path, 'w') as f:
    json.dump(m, f, indent=2)
PYEOF
}

# ── PID tracking ──────────────────────────────────────────────────────────────

ECHO_PID=""
ECHO_SLOW_PID=""
NGINX_PID=""
HAPROXY_PID=""
FLEXGATE_PID=""
SAMPLER_PID=""

cleanup() {
    echo ""
    info "Tearing down processes..."
    [[ -n "$SAMPLER_PID"   ]] && kill "$SAMPLER_PID"   2>/dev/null || true
    [[ -n "$FLEXGATE_PID"  ]] && kill "$FLEXGATE_PID"  2>/dev/null || true
    [[ -n "$HAPROXY_PID"   ]] && kill "$HAPROXY_PID"   2>/dev/null || true
    [[ -n "$NGINX_PID"     ]] && kill "$NGINX_PID"     2>/dev/null || true
    [[ -n "$ECHO_SLOW_PID" ]] && kill "$ECHO_SLOW_PID" 2>/dev/null || true
    [[ -n "$ECHO_PID"      ]] && kill "$ECHO_PID"      2>/dev/null || true
    wait 2>/dev/null || true
    manifest_finish || true
    info "Results written to: $RUN_DIR"
}
trap cleanup EXIT INT TERM

# ── Helpers ───────────────────────────────────────────────────────────────────

wait_for_http() {
    local url="$1" retries="${2:-30}" delay="${3:-0.5}"
    local i=0
    while (( i++ < retries )); do
        if curl -sf "$url" &>/dev/null; then return 0; fi
        sleep "$delay"
    done
    error "Timed out waiting for $url after $((retries * 1)) attempts"
    return 1
}

seed_route() {
    # seed_route <admin_url> <path> <target> <methods_json>
    local admin_url="$1" rpath="$2" rtarget="$3" methods="${4:-[\"GET\"]}"
    curl -sf -X POST "${admin_url}/api/routes" \
        -H 'Content-Type: application/json' \
        -d "{\"path\":\"${rpath}\",\"target\":\"${rtarget}\",\"methods\":${methods},\"active\":true}" \
        &>/dev/null \
        && return 0 \
        || return 1
}

# ── run_scenario <name> <target_url> <proxy_pid> ──────────────────────────────
#
# Runs a single k6 scenario and:
#   1. Starts the system metrics sampler
#   2. Runs k6, writing raw output to logs/<name>-k6.log
#   3. Copies the canonical result to <run_dir>/<name>.json
#   4. Merges system metrics into the canonical result
#   5. Records pass/fail in the manifest

run_scenario() {
    local scenario="$1"
    local target_url="$2"
    local proxy_pid="${3:-${ECHO_PID}}"

    if echo "$SKIP_SCENARIOS" | grep -qw "$scenario"; then
        warn "Skipping scenario: $scenario (SKIP_SCENARIOS)"
        manifest_record "$scenario" "skipped"
        return 0
    fi

    local k6_log="$LOGS_DIR/${scenario}-k6.log"
    local system_jsonl="$LOGS_DIR/${scenario}-system.jsonl"
    local canonical="$RUN_DIR/${scenario}.json"

    # k6 handleSummary writes to benchmarks/results/<scenario>-<ts>.json
    # We redirect it here by setting the RUN_TS env var used inside each scenario.
    local raw_result="$BENCH_DIR/results/${scenario}-${UNIX_TS}.json"

    step "$scenario" "→  $target_url  (profile: $PROFILE)"

    # ── 1. Start system sampler ──────────────────────────────────────────────
    bash "$SCRIPTS_DIR/collect-metrics.sh" "$proxy_pid" "$system_jsonl" 1 &
    SAMPLER_PID=$!

    # ── 2. Run k6 ────────────────────────────────────────────────────────────
    local k6_exit=0
    GIT_SHA="$GIT_SHA"                                              \
    BENCH_OS="$BENCH_OS"                                            \
    BENCH_CPU="$BENCH_CPU"                                          \
    TARGET_URL="$target_url"                                        \
    PROFILE="$PROFILE"                                              \
    BASELINE_P50_MS="${BASELINE_P50_MS:-0}"                         \
    FLEXGATE_ADMIN_URL="http://127.0.0.1:${FLEXGATE_ADMIN_PORT}"   \
    k6 run \
        --out "json=${raw_result}" \
        ${K6_EXTRA_ARGS} \
        "$K6_DIR/scenarios/${scenario}.js" \
        2>&1 | tee "$k6_log" \
    || k6_exit=$?

    # ── 3. Stop sampler ───────────────────────────────────────────────────────
    kill "$SAMPLER_PID" 2>/dev/null || true
    wait "$SAMPLER_PID" 2>/dev/null || true
    SAMPLER_PID=""

    # ── 4. Copy raw result to canonical path ─────────────────────────────────
    # handleSummary writes to benchmarks/results/<scenario>-<unix_ts>.json
    # We also accept the timestamped file from the run-dir temp results area.
    local found_result=""
    if [[ -f "$raw_result" ]]; then
        found_result="$raw_result"
    else
        # Fallback: find newest matching file written in the last 60 s
        found_result=$(find "$BENCH_DIR/results" -maxdepth 1 \
                           -name "${scenario}-*.json" \
                           -not -name "*system*" \
                           -not -name "schema*" \
                           -newer "$BENCH_DIR/results/schema.json" \
                           2>/dev/null \
                       | sort | tail -1)
    fi

    if [[ -n "$found_result" && -f "$found_result" ]]; then
        cp "$found_result" "$canonical"

        # ── 5. Merge system metrics ─────────────────────────────────────────
        if [[ -f "$system_jsonl" ]]; then
            node "$SCRIPTS_DIR/merge-system-metrics.js" \
                 "$canonical" "$system_jsonl" \
                 2>/dev/null || warn "System metrics merge failed (non-fatal)"
        fi

        local status="pass"
        if (( k6_exit != 0 )); then
            status="fail"
            OVERALL_EXIT=1
            warn "Scenario $scenario FAILED (k6 exit $k6_exit) — thresholds breached"
        else
            success "Scenario $scenario PASSED  →  $canonical"
        fi
        manifest_record "$scenario" "$status" "$canonical"
    else
        warn "No result file found for scenario $scenario — marking as error"
        manifest_record "$scenario" "error"
        OVERALL_EXIT=1
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════════════════════════

banner "FlexGate Benchmark Runner   profile=${PROFILE}   run=${RUN_ID}"

manifest_init

# Epoch seconds used by k6 handleSummary for file naming
UNIX_TS=$(date +%s)

# ── STEP 0: Check dependencies ────────────────────────────────────────────────

step "0" "Checking dependencies"

DEP_FAIL=0
for cmd in k6 haproxy nginx node python3 curl; do
    if command -v "$cmd" &>/dev/null; then
        info "$cmd: $(command -v $cmd)"
    else
        error "$cmd not found"
        DEP_FAIL=1
    fi
done
if (( DEP_FAIL )); then
    error "Missing dependencies — install with: brew install k6 haproxy nginx"
    exit 2
fi

# Build echo server if missing
if [[ ! -x "$ECHO_BIN" ]]; then
    info "Building echo server..."
    go build -o "$ECHO_BIN" "$TARGETS_DIR/echo-server/" \
        || { error "Echo server build failed"; exit 2; }
    success "Echo server built"
fi

# Check FlexGate binary
if [[ ! -x "$FLEXGATE_BIN" ]]; then
    info "Building FlexGate..."
    go build -o "$FLEXGATE_BIN" "$REPO_ROOT/..." \
        || { error "FlexGate build failed — set FLEXGATE_BIN to point to the binary"; exit 2; }
    success "FlexGate built"
fi

success "All dependencies satisfied"

# ── STEP 1: Start environment ─────────────────────────────────────────────────

step "1" "Starting environment"

# Echo server (fast — shared upstream for all scenarios)
info "Starting echo server on :${ECHO_PORT}..."
"$ECHO_BIN" -addr ":${ECHO_PORT}" &
ECHO_PID=$!
wait_for_http "http://127.0.0.1:${ECHO_PORT}/health" 30 0.5
success "Echo server up  PID=${ECHO_PID}"

# Nginx
info "Starting Nginx on :${NGINX_PORT}..."
nginx -c "$TARGETS_DIR/nginx.conf" -p "$TARGETS_DIR" &
NGINX_PID=$!
wait_for_http "http://127.0.0.1:${NGINX_PORT}/health" 20 0.5
success "Nginx up  PID=${NGINX_PID}"

# HAProxy (serves all bench frontends on 9002–9004 + 9006)
info "Starting HAProxy on :${HAPROXY_PORT}/:${FLEXGATE_INLINE_PORT}/:${FLEXGATE_MIRROR_PORT}/:${REALISTIC_PORT}..."
haproxy -f "$TARGETS_DIR/haproxy-bench.cfg" &
HAPROXY_PID=$!
wait_for_http "http://127.0.0.1:${HAPROXY_PORT}/health" 20 0.5
success "HAProxy up  PID=${HAPROXY_PID}"

# FlexGate
info "Starting FlexGate on :${FLEXGATE_PROXY_PORT} (admin :${FLEXGATE_ADMIN_PORT})..."
FLEXGATE_CONFIG="$FLEXGATE_CFG" "$FLEXGATE_BIN" &
FLEXGATE_PID=$!
wait_for_http "http://127.0.0.1:${FLEXGATE_ADMIN_PORT}/health" 30 0.5
success "FlexGate up  PID=${FLEXGATE_PID}"

# Seed core /bench route
info "Seeding /bench route..."
seed_route "http://127.0.0.1:${FLEXGATE_ADMIN_PORT}" \
           "/bench" "http://127.0.0.1:${ECHO_PORT}" '["GET"]' \
    && success "/bench route registered" \
    || warn "/bench route seed failed — inline/mirror scenarios may 404"

success "Environment ready"

# ── STEP 2: Baseline test ─────────────────────────────────────────────────────

step "2" "Baseline — direct echo (no proxy)"
run_scenario "baseline" "http://127.0.0.1:${ECHO_PORT}" "${ECHO_PID}"

# Extract baseline p50 for overhead deltas in all subsequent scenarios
BASELINE_P50_MS=0
if [[ -f "$RUN_DIR/baseline.json" ]]; then
    BASELINE_P50_MS=$(python3 - "$RUN_DIR/baseline.json" <<'PYEOF'
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    print(d['metrics']['latency_ms'].get('p50') or 0)
except Exception:
    print(0)
PYEOF
    )
    export BASELINE_P50_MS
    success "Baseline p50 = ${BASELINE_P50_MS} ms"
fi

# ── STEP 3: Nginx test ────────────────────────────────────────────────────────

step "3" "Nginx proxy"
run_scenario "nginx" "http://127.0.0.1:${NGINX_PORT}" "${NGINX_PID}"

# Nginx no longer needed — tear it down to free resources
kill "$NGINX_PID" 2>/dev/null || true
wait "$NGINX_PID" 2>/dev/null || true
NGINX_PID=""
info "Nginx stopped"

# ── STEP 4: HAProxy test ──────────────────────────────────────────────────────

step "4" "HAProxy proxy"
run_scenario "haproxy" "http://127.0.0.1:${HAPROXY_PORT}" "${HAPROXY_PID}"

# ── STEP 5: FlexGate tests ────────────────────────────────────────────────────

step "5a" "FlexGate inline  (HAProxy → FlexGate → Echo)"
run_scenario "flexgate-inline" "http://127.0.0.1:${FLEXGATE_INLINE_PORT}" "${FLEXGATE_PID}"

step "5b" "FlexGate mirror  (HAProxy → Echo + async mirror to FlexGate)"
run_scenario "flexgate-mirror" "http://127.0.0.1:${FLEXGATE_MIRROR_PORT}" "${HAPROXY_PID}"

# Realistic traffic (Stage 2) — seed extra routes then run
step "5c" "Realistic mixed traffic  (Stage 2)"

info "Starting slow echo server on :${ECHO_SLOW_PORT} (50 ms latency)..."
"$ECHO_BIN" -addr ":${ECHO_SLOW_PORT}" -latency 50000 &
ECHO_SLOW_PID=$!
wait_for_http "http://127.0.0.1:${ECHO_SLOW_PORT}/health" 20 0.5
success "Slow echo up  PID=${ECHO_SLOW_PID}"

info "Seeding realistic routes..."
ADMIN_URL="http://127.0.0.1:${FLEXGATE_ADMIN_PORT}"
seed_route "$ADMIN_URL" "/bench/v2"     "http://127.0.0.1:${ECHO_PORT}"      '["GET"]'  || true
seed_route "$ADMIN_URL" "/bench/echo"   "http://127.0.0.1:${ECHO_PORT}"      '["POST"]' || true
seed_route "$ADMIN_URL" "/bench/status" "http://127.0.0.1:${ECHO_PORT}"      '["GET"]'  || true
seed_route "$ADMIN_URL" "/bench/items"  "http://127.0.0.1:${ECHO_PORT}"      '["GET"]'  || true
seed_route "$ADMIN_URL" "/bench/items/" "http://127.0.0.1:${ECHO_PORT}"      '["GET"]'  || true
seed_route "$ADMIN_URL" "/bench/slow"   "http://127.0.0.1:${ECHO_SLOW_PORT}" '["GET"]'  || true
success "Realistic routes registered"

run_scenario "realistic" "http://127.0.0.1:${REALISTIC_PORT}" "${FLEXGATE_PID}"

kill "$ECHO_SLOW_PID" 2>/dev/null || true
wait "$ECHO_SLOW_PID" 2>/dev/null || true
ECHO_SLOW_PID=""

# ── STEP 6: Collect & consolidate results ─────────────────────────────────────

step "6" "Collecting results"

info "Generating comparison report..."
node "$SCRIPTS_DIR/compare.js" "$RUN_DIR" \
    | tee "$RUN_DIR/comparison.md" \
    || warn "Comparison report failed (non-fatal)"

info "Running Stage 5 analysis..."
node "$SCRIPTS_DIR/analyse.js" "$RUN_DIR" \
    | tee "$RUN_DIR/report.md" \
    || warn "Analysis failed (non-fatal)"

# ── Stage 3 load tests (optional) ────────────────────────────────────────────

if [[ "${SKIP_STAGE3}" == "1" ]]; then
    warn "SKIP_STAGE3=1 — skipping steady/spike/stress tests"
else
    banner "Stage 3 — Load Tests   (steady / spike / stress)"
    info "These run against the same inline topology: HAProxy :${FLEXGATE_INLINE_PORT} → FlexGate → Echo"
    info "Stress test is expected to find the break point — abortOnFail at 10 % error rate"

    run_scenario "steady-load" "http://127.0.0.1:${FLEXGATE_INLINE_PORT}" "${FLEXGATE_PID}"
    run_scenario "spike"       "http://127.0.0.1:${FLEXGATE_INLINE_PORT}" "${FLEXGATE_PID}"
    run_scenario "stress"      "http://127.0.0.1:${FLEXGATE_INLINE_PORT}" "${FLEXGATE_PID}"

    # Refresh comparison report and analysis to include Stage 3 results
    info "Refreshing comparison report with Stage 3 results..."
    node "$SCRIPTS_DIR/compare.js" "$RUN_DIR" \
        | tee "$RUN_DIR/comparison.md" \
        || warn "Comparison refresh failed (non-fatal)"
    node "$SCRIPTS_DIR/analyse.js" "$RUN_DIR" \
        | tee "$RUN_DIR/report.md" \
        || warn "Analysis refresh failed (non-fatal)"
fi

# ── Final summary ──────────────────────────────────────────────────────────────

manifest_finish

echo ""
banner "Run complete   run=${RUN_ID}"

echo -e "  ${BOLD}Results directory:${RESET}  $RUN_DIR"
echo ""
echo -e "  ${BOLD}Result files:${RESET}"
ls -1 "$RUN_DIR"/*.json 2>/dev/null | sed 's/^/    /'
echo ""
echo -e "  ${BOLD}Scenario outcomes:${RESET}"
for pair in "${SCENARIO_STATUSES[@]}"; do
    sc_name="${pair%%:*}"
    sc_status="${pair##*:}"
    case "$sc_status" in
        pass)    echo -e "    ${GREEN}✔${RESET}  $sc_name" ;;
        fail)    echo -e "    ${RED}✖${RESET}  $sc_name" ;;
        skipped) echo -e "    ${YELLOW}–${RESET}  $sc_name  (skipped)" ;;
        *)       echo -e "    ${YELLOW}?${RESET}  $sc_name  ($sc_status)" ;;
    esac
done
echo ""
echo -e "  ${BOLD}Comparison report:${RESET}  $RUN_DIR/comparison.md"
echo -e "  ${BOLD}Analysis report:${RESET}    $RUN_DIR/report.md"
echo -e "  ${BOLD}Analysis summary:${RESET}   $RUN_DIR/summary.json"
echo -e "  ${BOLD}Runner log:${RESET}         $LOGS_DIR/runner.log"
echo -e "  ${BOLD}Manifest:${RESET}           $MANIFEST_FILE"
echo ""

if (( OVERALL_EXIT != 0 )); then
    error "One or more scenarios FAILED — see manifest for details"
fi

exit $OVERALL_EXIT
