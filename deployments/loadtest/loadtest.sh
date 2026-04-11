#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# FlexGate Load Test Suite
# ─────────────────────────────────────────────────────────────────────────────
#
# Prerequisites:
#   brew install wrk   (macOS)
#   apt install wrk    (Debian/Ubuntu)
#
# Usage:
#   ./loadtest.sh [TARGET_HOST] [TARGET_PORT]
#
# Defaults: localhost:8080
#
# Tests:
#   1. Baseline throughput  — GET /health (zero upstream latency)
#   2. Proxy throughput     — GET /api/echo (1 upstream hop, keepalive)
#   3. Latency profile      — single-threaded low-rate to measure clean p99
#   4. Concurrency ramp     — 10→50→100→200→500 connections
#   5. Large body           — POST with 64 KiB body
#   6. Mixed method         — GET/POST/DELETE weighted 70/20/10
#   7. Sustained soak       — 10 min at 50% peak RPS
#
# Expected results (4-core host, 1 GiB RSS limit, production config):
#   Test 1 (health):      ≥ 80,000 req/s    p99 < 1 ms
#   Test 2 (proxy):       ≥ 40,000 req/s    p99 < 5 ms
#   Test 3 (latency):     p50 < 1 ms        p99 < 3 ms
#   Test 4 (c=500):       ≥ 30,000 req/s    error rate < 0.01%
#   Test 5 (large body):  ≥ 10,000 req/s    p99 < 20 ms
#   Test 6 (mixed):       ≥ 35,000 req/s    p99 < 8 ms
#   Test 7 (soak 10m):    throughput stable  no memory growth > 5%
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

HOST="${1:-localhost}"
PORT="${2:-8080}"
BASE="http://${HOST}:${PORT}"

THREADS=4         # match available vCPU count
DURATION=30s      # per-test duration
SOAK_DURATION=10m

# Colour helpers
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
header() { echo -e "\n${CYAN}━━━ $* ━━━${NC}"; }
pass()   { echo -e "${GREEN}✓ $*${NC}"; }
note()   { echo -e "${YELLOW}⚑ $*${NC}"; }

require_wrk() {
  if ! command -v wrk &>/dev/null; then
    echo "wrk not found. Install: brew install wrk  |  apt install wrk"
    exit 1
  fi
}

# ── pre-flight: confirm the proxy is up ──────────────────────────────────────
preflight() {
  header "Pre-flight health check → ${BASE}/health"
  if curl -sf "${BASE}/health" >/dev/null; then
    pass "Proxy is up"
  else
    echo "FATAL: proxy not reachable at ${BASE}/health"
    exit 1
  fi
}

# ── test 1: baseline throughput (health endpoint) ────────────────────────────
test_baseline() {
  header "Test 1 — Baseline throughput (GET /health, c=100)"
  note "Expected: ≥ 80,000 req/s, p99 < 1 ms"
  wrk -t${THREADS} -c100 -d${DURATION} --latency \
    "${BASE}/health"
}

# ── test 2: proxy throughput ──────────────────────────────────────────────────
test_proxy_throughput() {
  header "Test 2 — Proxy throughput (GET ${BASE}/, c=100)"
  note "Expected: ≥ 40,000 req/s, p99 < 5 ms"
  wrk -t${THREADS} -c100 -d${DURATION} --latency \
    "${BASE}/"
}

# ── test 3: latency profile (low concurrency) ─────────────────────────────────
test_latency() {
  header "Test 3 — Latency profile (GET /health, c=10, 1 thread)"
  note "Expected: p50 < 1 ms, p99 < 3 ms"
  wrk -t1 -c10 -d${DURATION} --latency \
    "${BASE}/health"
}

# ── test 4: concurrency ramp ──────────────────────────────────────────────────
test_concurrency_ramp() {
  header "Test 4 — Concurrency ramp"
  for conns in 10 50 100 200 500; do
    note "  c=${conns}"
    wrk -t${THREADS} -c${conns} -d15s --latency \
      "${BASE}/health" 2>&1 | grep -E "Requests/sec:|Latency|errors" | sed "s/^/    /"
    sleep 2
  done
}

# ── test 5: large request body ────────────────────────────────────────────────
test_large_body() {
  header "Test 5 — Large body POST (64 KiB, c=50)"
  note "Expected: ≥ 10,000 req/s, p99 < 20 ms"
  # Generate a 64 KiB JSON body once and write a wrk Lua script.
  TMP=$(mktemp -d)
  python3 -c "
import json, os
body = json.dumps({'data': 'x' * 65000})
print(f'wrk.method = \"POST\"')
print(f'wrk.body   = {repr(body)}')
print(f'wrk.headers[\"Content-Type\"] = \"application/json\"')
" > "${TMP}/post.lua"

  wrk -t${THREADS} -c50 -d${DURATION} --latency \
    -s "${TMP}/post.lua" \
    "${BASE}/"
  rm -rf "${TMP}"
}

# ── test 6: mixed method workload ─────────────────────────────────────────────
test_mixed_methods() {
  header "Test 6 — Mixed method workload (GET 70% / POST 20% / DELETE 10%, c=100)"
  note "Expected: ≥ 35,000 req/s, p99 < 8 ms"
  TMP=$(mktemp -d)
  cat > "${TMP}/mixed.lua" << 'LUA'
math.randomseed(os.time())
local methods = {}
for i=1,70 do methods[i] = "GET"    end
for i=71,90 do methods[i] = "POST"  end
for i=91,100 do methods[i] = "DELETE" end

request = function()
  local m = methods[math.random(1,100)]
  if m == "POST" then
    wrk.method = "POST"
    wrk.body   = '{"probe":true}'
    wrk.headers["Content-Type"] = "application/json"
  else
    wrk.method = m
    wrk.body   = nil
  end
  return wrk.format(nil, "/")
end
LUA

  wrk -t${THREADS} -c100 -d${DURATION} --latency \
    -s "${TMP}/mixed.lua" \
    "${BASE}/"
  rm -rf "${TMP}"
}

# ── test 7: sustained soak ────────────────────────────────────────────────────
test_soak() {
  header "Test 7 — Sustained soak (${SOAK_DURATION}, c=100)"
  note "Expected: stable throughput, RSS growth < 5%"
  note "Soak running for ${SOAK_DURATION} — press Ctrl-C to abort early"

  # Capture RSS before soak
  RSS_BEFORE=$(ps -o rss= -p "$(pgrep -f flexgate-proxy 2>/dev/null | head -1)" 2>/dev/null || echo 0)

  wrk -t${THREADS} -c100 -d${SOAK_DURATION} --latency \
    "${BASE}/health"

  RSS_AFTER=$(ps -o rss= -p "$(pgrep -f flexgate-proxy 2>/dev/null | head -1)" 2>/dev/null || echo 0)

  if [[ "${RSS_BEFORE}" -gt 0 && "${RSS_AFTER}" -gt 0 ]]; then
    GROWTH=$(( (RSS_AFTER - RSS_BEFORE) * 100 / RSS_BEFORE ))
    if [[ ${GROWTH} -lt 5 ]]; then
      pass "RSS growth: ${GROWTH}% (before=${RSS_BEFORE} KiB, after=${RSS_AFTER} KiB)"
    else
      note "WARNING: RSS growth ${GROWTH}% exceeds 5% threshold — possible memory leak"
    fi
  else
    note "Could not measure RSS (process not found or pgrep unavailable)"
  fi
}

# ── main ──────────────────────────────────────────────────────────────────────
require_wrk
preflight

echo ""
echo "Target: ${BASE}"
echo "Threads: ${THREADS}  Duration per test: ${DURATION}"
echo ""

test_baseline
test_proxy_throughput
test_latency
test_concurrency_ramp
test_large_body
test_mixed_methods

# Soak test is opt-in — it takes 10 minutes.
if [[ "${RUN_SOAK:-0}" == "1" ]]; then
  test_soak
else
  note "Soak test skipped. Run with RUN_SOAK=1 ./loadtest.sh to enable."
fi

header "Load test suite complete"
