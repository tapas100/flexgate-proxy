#!/usr/bin/env bash
# start.sh — FlexGate full-stack launcher via PM2
#
# Starts three processes via ecosystem.config.js:
#   1. flexgate-proxy    — Go binary  (admin API on :8080)
#   2. flexgate-admin-ui — React dev server (:3000)
#   3. benchmark-runner  — Node k6 runner (optional, --bench flag)
#
# With --bench, also starts the 5 benchmark target servers as background
# processes (killed automatically on --stop):
#   echo-server   :9000  — direct upstream (baseline)
#   nginx         :9001  — nginx → echo
#   haproxy       :9002  — haproxy → echo
#   haproxy       :9003  — haproxy → flexgate-proxy → echo  (inline)
#   flexgate      :8081  — flexgate mirror instance
#
# Usage:
#   ./start.sh                        # proxy + UI only
#   ./start.sh --bench                # proxy + UI + targets + benchmark run
#   ./start.sh --rerun                # re-run benchmarks (targets already up)
#   ./start.sh --bench --scenario baseline
#   ./start.sh --bench --profile full
#   ./start.sh --stop                 # stop pm2 apps + kill target servers
#   ./start.sh --logs                 # tail all logs after start
#   ./start.sh --help
#
# Environment overrides:
#   BENCHMARK_API_URL=http://host:8080 ./start.sh --bench
#   BENCHMARK_API_USER=user BENCHMARK_API_PASS=pass ./start.sh --bench

set -euo pipefail

# ── Paths ─────────────────────────────────────────────────────────────────────

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ECOSYSTEM="${ROOT}/ecosystem.config.js"
BINARY="${ROOT}/flexgate"
GO_MAIN="${ROOT}/cmd/flexgate/main.go"
LOGS_DIR="${ROOT}/logs"
ADMIN_UI="${ROOT}/admin-ui"

# Benchmark target server paths
TARGETS_DIR="${ROOT}/benchmarks/targets"
ECHO_BIN="${TARGETS_DIR}/echo-server/echo-server"
ECHO_SRC="${TARGETS_DIR}/echo-server/main.go"
NGINX_CONF="${TARGETS_DIR}/nginx.conf"
HAPROXY_CFG="${TARGETS_DIR}/haproxy-bench.cfg"
BENCH_CFG="${ROOT}/config/flexgate.bench.json"

# PID file for benchmark target processes (so --stop can kill them)
TARGETS_PID_FILE="${ROOT}/.bench-targets.pids"

# ── Colours ───────────────────────────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[info]${RESET}  $*"; }
ok()      { echo -e "${GREEN}[ok]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[warn]${RESET}  $*"; }
error()   { echo -e "${RED}[error]${RESET} $*" >&2; }
section() { echo -e "\n${BOLD}── $* ──${RESET}"; }

# ── Helpers ───────────────────────────────────────────────────────────────────

# Wait for an HTTP endpoint to return 200, retrying up to N times
wait_http() {
  local url="$1" retries="${2:-30}" delay="${3:-0.5}"
  local i=0
  while (( i++ < retries )); do
    if curl -sf --max-time 1 "$url" &>/dev/null; then return 0; fi
    sleep "$delay"
  done
  error "Timed out waiting for ${url}"
  return 1
}

# Wait for a TCP port to accept connections (used for HAProxy which has no /health)
wait_tcp() {
  local host="$1" port="$2" retries="${3:-30}" delay="${4:-0.5}"
  local i=0
  while (( i++ < retries )); do
    if (echo >/dev/tcp/"$host"/"$port") 2>/dev/null; then return 0; fi
    sleep "$delay"
  done
  error "Timed out waiting for TCP ${host}:${port}"
  return 1
}

# Save a PID to the targets PID file
save_pid() { echo "$1" >> "${TARGETS_PID_FILE}"; }

# ── Argument parsing ──────────────────────────────────────────────────────────

RUN_BENCH=false
BENCH_SCENARIO=""
BENCH_PROFILE="${PROFILE:-ci}"
TAIL_LOGS=false
DO_STOP=false
DO_RERUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --bench)           RUN_BENCH=true;         shift ;;
    --rerun)           DO_RERUN=true;          shift ;;
    --scenario)        BENCH_SCENARIO="$2";    shift 2 ;;
    --scenario=*)      BENCH_SCENARIO="${1#*=}"; shift ;;
    --profile)         BENCH_PROFILE="$2";     shift 2 ;;
    --profile=*)       BENCH_PROFILE="${1#*=}"; shift ;;
    --logs|-l)         TAIL_LOGS=true;         shift ;;
    --stop)            DO_STOP=true;           shift ;;
    --help|-h)
      sed -n '2,21p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'
      exit 0
      ;;
    *) error "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Stop mode ─────────────────────────────────────────────────────────────────

if $DO_STOP; then
  section "Stopping all PM2 apps"
  pm2 delete flexgate-proxy    2>/dev/null && ok "flexgate-proxy stopped"    || warn "flexgate-proxy was not running"
  pm2 delete flexgate-admin-ui 2>/dev/null && ok "flexgate-admin-ui stopped" || warn "flexgate-admin-ui was not running"
  pm2 delete benchmark-runner  2>/dev/null && ok "benchmark-runner stopped"  || warn "benchmark-runner was not running"
  pm2 save --force >/dev/null 2>&1

  if [[ -f "${TARGETS_PID_FILE}" ]]; then
    section "Stopping benchmark target servers"
    while IFS= read -r pid; do
      if kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null && ok "Killed PID $pid" || warn "PID $pid already gone"
      fi
    done < "${TARGETS_PID_FILE}"
    rm -f "${TARGETS_PID_FILE}"
    ok "Target servers stopped"
  else
    info "No benchmark target PIDs on record"
  fi

  ok "Done."
  exit 0
fi

# ── Rerun mode ────────────────────────────────────────────────────────────────
# --rerun skips all preflight and target-server startup; it simply restarts the
# benchmark-runner PM2 process (which is one-shot and stopped after each run).
# Useful after a benchmark completes and you want to run it again immediately.

if $DO_RERUN; then
  section "Re-running benchmark-runner"

  # Apply any scenario/profile overrides via env before restarting.
  if [[ -n "${BENCH_SCENARIO}" ]]; then
    pm2 restart benchmark-runner \
      --update-env \
      --env "BENCHMARK_SCENARIO=${BENCH_SCENARIO},PROFILE=${BENCH_PROFILE}" \
      2>/dev/null \
      || pm2 start "${ECOSYSTEM}" --only benchmark-runner \
           --env "BENCHMARK_SCENARIO=${BENCH_SCENARIO}" 2>/dev/null
  else
    pm2 restart benchmark-runner --update-env 2>/dev/null \
      || pm2 start "${ECOSYSTEM}" --only benchmark-runner 2>/dev/null
  fi

  ok "benchmark-runner restarted"
  info "Watch live:  pm2 logs benchmark-runner"
  info "Dashboard:   http://localhost:3000/benchmarks"
  exit 0
fi

# ── Banner ────────────────────────────────────────────────────────────────────

echo -e "${BOLD}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          FlexGate — PM2 Stack Launcher                       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${RESET}"
echo "  Root       : ${ROOT}"
echo "  Ecosystem  : ${ECOSYSTEM}"
echo "  Benchmarks : $( $RUN_BENCH && echo "yes — profile=${BENCH_PROFILE}${BENCH_SCENARIO:+, scenario=${BENCH_SCENARIO}}" || echo "no (pass --bench to enable)" )"
echo ""

# ── Pre-flight checks ─────────────────────────────────────────────────────────

section "Pre-flight checks"

# pm2
if ! command -v pm2 &>/dev/null; then
  error "pm2 not found. Install with:  npm install -g pm2"
  exit 1
fi
ok "pm2 $(pm2 --version)"

# Node
if ! command -v node &>/dev/null; then
  error "node not found."
  exit 1
fi
ok "node $(node --version)"

# Go binary — build if missing or source is newer
if [[ ! -x "${BINARY}" ]]; then
  warn "Binary '${BINARY}' not found — building now…"
  go build -o "${BINARY}" "${GO_MAIN}" && ok "Binary built: ${BINARY}"
else
  # Rebuild if any Go source file is newer than the binary
  NEWEST_SRC="$(find "${ROOT}" -name '*.go' -newer "${BINARY}" 2>/dev/null | head -1)"
  if [[ -n "${NEWEST_SRC}" ]]; then
    info "Source changes detected — rebuilding binary…"
    go build -o "${BINARY}" "${GO_MAIN}" && ok "Binary rebuilt: ${BINARY}"
  else
    ok "Binary up-to-date: ${BINARY}"
  fi
fi

# admin-ui node_modules
if [[ ! -d "${ADMIN_UI}/node_modules" ]]; then
  warn "admin-ui/node_modules missing — running npm install…"
  npm --prefix "${ADMIN_UI}" install --silent && ok "admin-ui deps installed"
else
  ok "admin-ui node_modules present"
fi

# k6 (only needed for benchmark-runner)
if $RUN_BENCH; then
  K6_BIN="${K6_BIN:-k6}"
  if ! command -v "${K6_BIN}" &>/dev/null; then
    error "k6 not found (looked for '${K6_BIN}')."
    error "Install: https://k6.io/docs/get-started/installation/"
    error "macOS:   brew install k6"
    exit 1
  fi
  ok "k6 $(${K6_BIN} version 2>&1 | head -1)"

  # nginx + haproxy — needed for :9001 and :9002/:9003
  for dep in nginx haproxy; do
    if ! command -v "$dep" &>/dev/null; then
      error "${dep} not found — required for benchmark targets."
      error "macOS:  brew install ${dep}"
      exit 1
    fi
    ok "${dep} $(command -v ${dep})"
  done

  # echo-server binary — build if missing or stale
  if [[ ! -x "${ECHO_BIN}" ]]; then
    info "Building echo-server binary…"
    go build -o "${ECHO_BIN}" "${ECHO_SRC%/*}/" && ok "echo-server built: ${ECHO_BIN}"
  else
    NEWER="$(find "${ECHO_SRC%/*}" -name '*.go' -newer "${ECHO_BIN}" 2>/dev/null | head -1)"
    if [[ -n "${NEWER}" ]]; then
      info "Rebuilding echo-server (source changed)…"
      go build -o "${ECHO_BIN}" "${ECHO_SRC%/*}/" && ok "echo-server rebuilt"
    else
      ok "echo-server binary up-to-date"
    fi
  fi

  # bench config
  if [[ ! -f "${BENCH_CFG}" ]]; then
    error "Bench config not found: ${BENCH_CFG}"
    error "Copy config/flexgate.json → config/flexgate.bench.json and adjust settings."
    exit 1
  fi
  ok "Bench config: ${BENCH_CFG}"
fi

# logs directory
mkdir -p "${LOGS_DIR}"
ok "Logs dir: ${LOGS_DIR}"

# ── Start proxy ───────────────────────────────────────────────────────────────

section "Starting flexgate-proxy"

# Stop any stale instance first so restart is clean
pm2 delete flexgate-proxy 2>/dev/null || true

pm2 start "${ECOSYSTEM}" --only flexgate-proxy --silent
ok "flexgate-proxy started"

# Give the Go server a moment to bind its ports before the UI and runner try to reach it
sleep 2

# ── Start admin UI ────────────────────────────────────────────────────────────

section "Starting flexgate-admin-ui"

pm2 delete flexgate-admin-ui 2>/dev/null || true

pm2 start "${ECOSYSTEM}" --only flexgate-admin-ui --silent
ok "flexgate-admin-ui started (http://localhost:3000)"

# ── Start benchmark targets (optional) ───────────────────────────────────────
#
# Topology:
#   echo-server :9000  ← baseline + upstream for all proxy scenarios
#   nginx       :9001  → echo :9000
#   haproxy     :9002  → echo :9000
#   haproxy     :9003  → flexgate-proxy :8080 → echo :9000   (inline)
#   flexgate    :8081  → echo :9000                          (mirror)

if $RUN_BENCH; then
  section "Starting benchmark target servers"

  # Clear stale PID file
  rm -f "${TARGETS_PID_FILE}"

  # ── 1. Echo server :9000 ────────────────────────────────────────────────────
  info "Starting echo-server on :9000…"
  "${ECHO_BIN}" -addr :9000 \
    >> "${LOGS_DIR}/echo-server.log" 2>&1 &
  ECHO_PID=$!
  save_pid "$ECHO_PID"
  wait_http "http://127.0.0.1:9000/health"
  ok "echo-server :9000  PID=${ECHO_PID}"

  # ── 2. Nginx :9001 → echo :9000 ─────────────────────────────────────────────
  info "Starting nginx on :9001…"
  nginx -c "${NGINX_CONF}" -p "${TARGETS_DIR}" \
    >> "${LOGS_DIR}/nginx.log" 2>&1 &
  NGINX_PID=$!
  save_pid "$NGINX_PID"
  wait_http "http://127.0.0.1:9001/health"
  ok "nginx :9001  PID=${NGINX_PID}"

  # ── 3+4. HAProxy :9002 (direct) + :9003 (inline via flexgate) ────────────────
  info "Starting haproxy on :9002 and :9003…"
  haproxy -f "${HAPROXY_CFG}" \
    >> "${LOGS_DIR}/haproxy.log" 2>&1 &
  HAPROXY_PID=$!
  save_pid "$HAPROXY_PID"
  # HAProxy has no /health HTTP endpoint — wait for the TCP port to open
  wait_tcp 127.0.0.1 9002
  ok "haproxy :9002/:9003  PID=${HAPROXY_PID}"

  # ── 5. FlexGate mirror instance :8081 → echo :9000 ───────────────────────────
  # A second flexgate process on the bench config with separate ports.
  # Route seeding is done below via its admin port :9091.
  info "Starting FlexGate mirror instance on :8081…"
  FLEXGATE_CONFIG="${BENCH_CFG}" \
  FLEXGATE_PROXY_PORT=8081 \
  FLEXGATE_PROXY_ADMIN_PORT=9091 \
    "${BINARY}" \
    >> "${LOGS_DIR}/flexgate-mirror.log" 2>&1 &
  FG_MIRROR_PID=$!
  save_pid "$FG_MIRROR_PID"
  wait_http "http://127.0.0.1:9091/health" 30 1
  ok "flexgate-mirror :8081  admin:9091  PID=${FG_MIRROR_PID}"

  # ── Route seeding ───────────────────────────────────────────────────────────
  # flexgate-proxy (pm2, proxy :8080, admin :9090) needs /bench → echo :9000
  # flexgate-mirror (proxy :8081, admin :9091) also needs /bench → echo :9000
  info "Seeding /bench routes…"
  ADMIN_USER="${FLEXGATE_ADMIN_USER:-admin}"
  ADMIN_PASS="${FLEXGATE_ADMIN_PASS:-admin}"
  for admin_port in 9090 9091; do
    curl -sf -u "${ADMIN_USER}:${ADMIN_PASS}" \
      -X POST "http://127.0.0.1:${admin_port}/api/routes" \
      -H 'Content-Type: application/json' \
      -d '{"route_id":"bench","path":"/bench","upstream":"http://127.0.0.1:9000","methods":["GET","POST","HEAD"],"enabled":true}' \
      &>/dev/null \
      && ok "/bench route → admin :${admin_port}" \
      || warn "Route seed failed for admin :${admin_port} (may already exist)"
  done

  ok "All benchmark target servers running"
  info "Ports:  echo=:9000  nginx=:9001  haproxy=:9002/:9003  flexgate-mirror=:8081"
fi

# ── Start benchmark runner (optional) ────────────────────────────────────────

if $RUN_BENCH; then
  section "Starting benchmark-runner"

  # Delete any previous (completed) run so pm2 lets us start fresh
  pm2 delete benchmark-runner 2>/dev/null || true

  # Export runner-specific env vars before pm2 reads ecosystem.config.js.
  # These are picked up by benchmarks/pm2-run.js at startup.
  export BENCHMARK_API_URL="${BENCHMARK_API_URL:-http://localhost:8080}"
  export BENCHMARK_API_USER="${BENCHMARK_API_USER:-admin}"
  export BENCHMARK_API_PASS="${BENCHMARK_API_PASS:-admin}"
  export PROFILE="${BENCH_PROFILE}"
  export BENCHMARK_SCENARIO="${BENCH_SCENARIO}"

  pm2 start "${ECOSYSTEM}" --only benchmark-runner --silent
  ok "benchmark-runner started"
  info "Stream results live:  pm2 logs benchmark-runner"
  info "Open dashboard:       http://localhost:3000/benchmarks"
fi

# ── Summary ───────────────────────────────────────────────────────────────────

section "Stack status"
pm2 list

echo ""
echo -e "${BOLD}Quick-reference:${RESET}"
echo "  Proxy API   → http://localhost:8080"
echo "  Admin UI    → http://localhost:3000"
echo "  Benchmarks  → http://localhost:3000/benchmarks"
if $RUN_BENCH; then
echo ""
echo -e "${BOLD}Benchmark targets:${RESET}"
echo "  Baseline    → http://localhost:9000  (echo server, direct)"
echo "  Nginx       → http://localhost:9001  (nginx → echo)"
echo "  HAProxy     → http://localhost:9002  (haproxy → echo)"
echo "  FG Inline   → http://localhost:9003  (haproxy → flexgate → echo)"
echo "  FG Mirror   → http://localhost:8081  (flexgate mirror → echo)"
fi
echo ""
echo -e "${BOLD}Useful commands:${RESET}"
echo "  pm2 logs                    # tail all logs"
echo "  pm2 logs benchmark-runner   # tail benchmark output"
echo "  pm2 monit                   # live dashboard"
echo "  ./start.sh --stop           # stop everything"
echo ""

# ── Tail logs (optional) ──────────────────────────────────────────────────────

if $TAIL_LOGS; then
  section "Tailing logs (Ctrl-C to exit)"
  pm2 logs
fi
