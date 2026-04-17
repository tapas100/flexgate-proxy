#!/usr/bin/env bash
# benchmarks/scripts/run-all.sh
#
# Orchestrate a full benchmark run: Stage 1 (5 proxy scenarios),
# Stage 2 (realistic traffic), Stage 3 (steady-load / spike / stress).
#
# Prerequisites:
#   brew install k6 haproxy nginx
#   go build -o benchmarks/targets/echo-server/echo-server \
#            ./benchmarks/targets/echo-server/
#
# Usage:
#   bash benchmarks/scripts/run-all.sh [ci|full]
#
# Environment variables:
#   FLEXGATE_BIN   — path to flexgate binary (default: ./flexgate)
#   FLEXGATE_CFG   — path to flexgate bench config (default: config/flexgate.bench.json)
#   PROFILE        — ci or full (default: full)
#   SKIP_SCENARIOS — space-separated list to skip, e.g. "nginx haproxy stress"
#   SKIP_STAGE3    — set to 1 to skip Stage 3 (load tests) entirely

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────

PROFILE="${1:-${PROFILE:-full}}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BENCH_DIR="$REPO_ROOT/benchmarks"
RESULTS_DIR="$BENCH_DIR/results"
SCRIPTS_DIR="$BENCH_DIR/scripts"
TARGETS_DIR="$BENCH_DIR/targets"
K6_DIR="$BENCH_DIR/k6"

FLEXGATE_BIN="${FLEXGATE_BIN:-$REPO_ROOT/flexgate}"
FLEXGATE_CFG="${FLEXGATE_CFG:-$REPO_ROOT/config/flexgate.bench.json}"
ECHO_BIN="$TARGETS_DIR/echo-server/echo-server"

ECHO_PORT=9000
NGINX_PORT=9001
HAPROXY_PORT=9002
FLEXGATE_INLINE_PORT=9003
FLEXGATE_MIRROR_PORT=9004
FLEXGATE_PROXY_PORT=8080
FLEXGATE_ADMIN_PORT=9090
REALISTIC_PORT=9006
ECHO_SLOW_PORT=9007

GIT_SHA=$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")
BENCH_OS=$(uname -srm)
BENCH_CPU=$(sysctl -n machdep.cpu.brand_string 2>/dev/null || \
            grep -m1 "model name" /proc/cpuinfo 2>/dev/null | cut -d: -f2 | xargs || \
            echo "unknown")
RUN_TS=$(date +%s)
SKIP_SCENARIOS="${SKIP_SCENARIOS:-}"

mkdir -p "$RESULTS_DIR"

# ── Colour helpers ────────────────────────────────────────────────────────────

BOLD="\033[1m"; CYAN="\033[36m"; GREEN="\033[32m"
YELLOW="\033[33m"; RED="\033[31m"; RESET="\033[0m"

info()    { echo -e "  ${CYAN}ℹ${RESET}  $*"; }
success() { echo -e "  ${GREEN}✔${RESET}  $*"; }
warn()    { echo -e "  ${YELLOW}⚠${RESET}  $*"; }
error()   { echo -e "  ${RED}✖${RESET}  $*" >&2; }
step()    { echo -e "\n${BOLD}${CYAN}[$1]${RESET} $2"; }

# ── Dependency checks ─────────────────────────────────────────────────────────

step "0/6" "Checking dependencies"

for cmd in k6 haproxy nginx; do
    if ! command -v "$cmd" &>/dev/null; then
        error "$cmd not found — install with: brew install $cmd"
        exit 1
    fi
    info "$cmd: $(command -v $cmd)"
done

if [[ ! -x "$ECHO_BIN" ]]; then
    warn "Echo server binary not found at $ECHO_BIN — building..."
    go build -o "$ECHO_BIN" "$TARGETS_DIR/echo-server/"
    success "Echo server built"
fi

# ── PID tracking (cleanup on exit) ───────────────────────────────────────────

ECHO_PID=""
ECHO_SLOW_PID=""
HAPROXY_PID=""
NGINX_PID=""
FLEXGATE_PID=""
SAMPLER_PID=""

cleanup() {
    info "Cleaning up processes..."
    [[ -n "$SAMPLER_PID"   ]] && kill "$SAMPLER_PID"   2>/dev/null || true
    [[ -n "$FLEXGATE_PID"  ]] && kill "$FLEXGATE_PID"  2>/dev/null || true
    [[ -n "$HAPROXY_PID"   ]] && kill "$HAPROXY_PID"   2>/dev/null || true
    [[ -n "$NGINX_PID"     ]] && kill "$NGINX_PID"     2>/dev/null || true
    [[ -n "$ECHO_SLOW_PID" ]] && kill "$ECHO_SLOW_PID" 2>/dev/null || true
    [[ -n "$ECHO_PID"      ]] && kill "$ECHO_PID"      2>/dev/null || true
    wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# ── Helper: wait for HTTP health ─────────────────────────────────────────────

wait_for_http() {
    local url="$1" retries="${2:-20}" delay="${3:-0.5}"
    local i=0
    while (( i++ < retries )); do
        if curl -sf "$url" &>/dev/null; then return 0; fi
        sleep "$delay"
    done
    error "Timed out waiting for $url"
    return 1
}

# ── Helper: run k6 scenario ──────────────────────────────────────────────────

run_k6() {
    local scenario="$1"
    local target_url="$2"
    local result_file="$RESULTS_DIR/${scenario}-${RUN_TS}.json"

    if echo "$SKIP_SCENARIOS" | grep -qw "$scenario"; then
        warn "Skipping scenario: $scenario"
        return 0
    fi

    step "k6" "Running scenario: $scenario  →  $target_url"

    # Start system sampler against the process whose PID is relevant
    local proxy_pid="${3:-$ECHO_PID}"   # default: echo server itself for baseline
    local metrics_file="$RESULTS_DIR/${scenario}-${RUN_TS}-system.jsonl"
    bash "$SCRIPTS_DIR/collect-metrics.sh" "$proxy_pid" "$metrics_file" 1 &
    SAMPLER_PID=$!

    GIT_SHA="$GIT_SHA"            \
    BENCH_OS="$BENCH_OS"          \
    BENCH_CPU="$BENCH_CPU"        \
    TARGET_URL="$target_url"      \
    PROFILE="$PROFILE"            \
    BASELINE_P50_MS="${BASELINE_P50_MS:-0}" \
    FLEXGATE_ADMIN_URL="http://127.0.0.1:$FLEXGATE_ADMIN_PORT" \
    k6 run \
        --out "json=$result_file" \
        "$K6_DIR/scenarios/${scenario}.js" \
        2>&1 | tee "$RESULTS_DIR/${scenario}-${RUN_TS}-k6.log"

    kill "$SAMPLER_PID" 2>/dev/null || true
    wait "$SAMPLER_PID" 2>/dev/null || true
    SAMPLER_PID=""

    success "Scenario $scenario complete → $result_file"
}

# ── Start echo server (shared upstream) ──────────────────────────────────────

step "1/6" "Starting echo server on :$ECHO_PORT"
"$ECHO_BIN" -addr ":$ECHO_PORT" &
ECHO_PID=$!
wait_for_http "http://127.0.0.1:$ECHO_PORT/health"
success "Echo server up  PID=$ECHO_PID"

# ── Scenario 0 — Baseline ─────────────────────────────────────────────────────

step "2/6" "Scenario 0 — Baseline (direct to echo)"
run_k6 "baseline" "http://127.0.0.1:$ECHO_PORT" "$ECHO_PID"

# Extract baseline p50 for overhead calculation in subsequent scenarios
BASELINE_RESULT="$RESULTS_DIR/baseline-${RUN_TS}.json"
if [[ -f "$BASELINE_RESULT" ]]; then
    BASELINE_P50_MS=$(python3 -c "
import json, sys
d = json.load(open('$BASELINE_RESULT'))
print(d['metrics']['latency_ms'].get('p50') or 0)
" 2>/dev/null || echo "0")
    export BASELINE_P50_MS
    success "Baseline p50 = ${BASELINE_P50_MS} ms  (used for overhead delta)"
fi

# ── Start Nginx ───────────────────────────────────────────────────────────────

step "3/6" "Starting Nginx on :$NGINX_PORT"
nginx -c "$TARGETS_DIR/nginx.conf" -p "$TARGETS_DIR" &
NGINX_PID=$!
wait_for_http "http://127.0.0.1:$NGINX_PORT/health"
success "Nginx up  PID=$NGINX_PID"

run_k6 "nginx" "http://127.0.0.1:$NGINX_PORT" "$NGINX_PID"

kill "$NGINX_PID" 2>/dev/null || true
wait "$NGINX_PID" 2>/dev/null || true
NGINX_PID=""

# ── Start HAProxy (all bench frontends) ──────────────────────────────────────

step "4/6" "Starting HAProxy on :$HAPROXY_PORT / :$FLEXGATE_INLINE_PORT / :$FLEXGATE_MIRROR_PORT"
haproxy -f "$TARGETS_DIR/haproxy-bench.cfg" &
HAPROXY_PID=$!
wait_for_http "http://127.0.0.1:$HAPROXY_PORT/health"
success "HAProxy up  PID=$HAPROXY_PID"

run_k6 "haproxy" "http://127.0.0.1:$HAPROXY_PORT" "$HAPROXY_PID"

# ── Start FlexGate (for Scenarios 3 + 4) ─────────────────────────────────────

step "5/6" "Starting FlexGate on :$FLEXGATE_PROXY_PORT"
if [[ ! -x "$FLEXGATE_BIN" ]]; then
    warn "FlexGate binary not found at $FLEXGATE_BIN — building..."
    go build -o "$FLEXGATE_BIN" "$REPO_ROOT/cmd/flexgate/"
fi

FLEXGATE_CONFIG="$FLEXGATE_CFG" "$FLEXGATE_BIN" &
FLEXGATE_PID=$!
wait_for_http "http://127.0.0.1:$FLEXGATE_ADMIN_PORT/health"
success "FlexGate up  PID=$FLEXGATE_PID"

# Seed the /bench route so FlexGate knows where to forward benchmark traffic
step "5b/6" "Seeding /bench route via admin API"
curl -sf -X POST "http://127.0.0.1:$FLEXGATE_ADMIN_PORT/api/routes" \
    -H 'Content-Type: application/json' \
    -d "{\"path\":\"/bench\",\"target\":\"http://127.0.0.1:$ECHO_PORT\",\"methods\":[\"GET\"],\"active\":true}" \
    &>/dev/null \
    && success "/bench route registered" \
    || warn "Route seed failed — FlexGate scenarios may 404 (ensure admin API is up)"

run_k6 "flexgate-inline" "http://127.0.0.1:$FLEXGATE_INLINE_PORT" "$FLEXGATE_PID"
run_k6 "flexgate-mirror" "http://127.0.0.1:$FLEXGATE_MIRROR_PORT" "$HAPROXY_PID"

# ── Stage 2 — Realistic traffic scenario ─────────────────────────────────────

step "5c/6" "Starting slow echo server on :$ECHO_SLOW_PORT (50 ms simulated latency)"
"$ECHO_BIN" -addr ":$ECHO_SLOW_PORT" -latency 50000 &
ECHO_SLOW_PID=$!
wait_for_http "http://127.0.0.1:$ECHO_SLOW_PORT/health"
success "Slow echo server up  PID=$ECHO_SLOW_PID"

step "5d/6" "Seeding realistic-traffic routes via admin API"
REALISTIC_ROUTES=(
    '{"path":"/bench/v2",     "target":"http://127.0.0.1:9000","methods":["GET"],         "active":true}'
    '{"path":"/bench/echo",   "target":"http://127.0.0.1:9000","methods":["POST"],        "active":true}'
    '{"path":"/bench/status", "target":"http://127.0.0.1:9000","methods":["GET"],         "active":true}'
    '{"path":"/bench/items",  "target":"http://127.0.0.1:9000","methods":["GET"],         "active":true}'
    '{"path":"/bench/items/", "target":"http://127.0.0.1:9000","methods":["GET"],         "active":true}'
    "{\"path\":\"/bench/slow\",  \"target\":\"http://127.0.0.1:$ECHO_SLOW_PORT\",\"methods\":[\"GET\"],\"active\":true}"
)
for payload in "${REALISTIC_ROUTES[@]}"; do
    curl -sf -X POST "http://127.0.0.1:$FLEXGATE_ADMIN_PORT/api/routes" \
        -H 'Content-Type: application/json' \
        -d "$payload" \
        &>/dev/null \
        && true \
        || warn "Route seed failed for payload: $payload"
done
success "Realistic routes registered (duplicates silently ignored)"

run_k6 "realistic" "http://127.0.0.1:$REALISTIC_PORT" "$FLEXGATE_PID"

# Tear down slow echo — no longer needed
kill "$ECHO_SLOW_PID" 2>/dev/null || true
wait "$ECHO_SLOW_PID" 2>/dev/null || true
ECHO_SLOW_PID=""

# ── Compare all results ───────────────────────────────────────────────────────

step "6/6" "Generating comparison report"
node "$SCRIPTS_DIR/compare.js" "$RESULTS_DIR" "$RUN_TS" \
    | tee "$RESULTS_DIR/comparison-${RUN_TS}.md"

success "All done.  Results in: $RESULTS_DIR/"
echo ""
echo "  Files:"
ls -1 "$RESULTS_DIR/"*"${RUN_TS}"* 2>/dev/null | sed 's/^/    /'

# ── Stage 3 — Load tests (steady / spike / stress) ───────────────────────────
# These run AFTER the proxy comparison suite because they stress the system
# harder (spike + stress may leave the process in a degraded state).
# Skip with:  SKIP_STAGE3=1 bash benchmarks/scripts/run-all.sh

if [[ "${SKIP_STAGE3:-0}" == "1" ]]; then
    warn "SKIP_STAGE3=1 — skipping Stage 3 load tests"
else
    echo ""
    echo -e "${BOLD}${CYAN}╔══════════════════════════════════╗${RESET}"
    echo -e "${BOLD}${CYAN}║  STAGE 3 — Load Tests            ║${RESET}"
    echo -e "${BOLD}${CYAN}╚══════════════════════════════════╝${RESET}"

    # FlexGate and HAProxy are still running from Stage 1/2 above.
    # Stage 3 routes to the same inline topology (HAProxy :9003 → FlexGate :8080).

    # ── Scenario 6: Steady Load ───────────────────────────────────────────────
    run_k6 "steady-load" "http://127.0.0.1:$FLEXGATE_INLINE_PORT" "$FLEXGATE_PID"

    # ── Scenario 7: Spike Test ────────────────────────────────────────────────
    run_k6 "spike" "http://127.0.0.1:$FLEXGATE_INLINE_PORT" "$FLEXGATE_PID"

    # ── Scenario 8: Stress Test ───────────────────────────────────────────────
    # Stress deliberately pushes beyond capacity — abortOnFail is set at 10 %
    # error rate, so this may exit early. That is expected behaviour.
    info "Stress test: abortOnFail at 10 % error rate — early exit is expected"
    run_k6 "stress" "http://127.0.0.1:$FLEXGATE_INLINE_PORT" "$FLEXGATE_PID"

    success "Stage 3 complete"
fi
echo ""
