#!/usr/bin/env bash
# benchmarks/scripts/soak-monitor.sh
#
# Stage 6 — Long-running soak monitor.
#
# Samples system resources (CPU%, RSS, FD count) for a target process at a
# configurable interval and writes timestamped JSONL.  Also polls a health
# endpoint to detect crash events.
#
# Usage
# ─────
#   ./soak-monitor.sh  <PID>  <out.jsonl>  [interval_s]  [health_url]
#
# Arguments
#   PID           PID of the FlexGate process to monitor
#   out.jsonl     Path for the JSONL output (appended if exists)
#   interval_s    Sample interval in seconds (default: 5)
#   health_url    URL to poll for health (default: http://localhost:8080/api/health)
#
# Output format (one JSON object per line)
# ────────────────────────────────────────
#   {
#     "ts":         <unix seconds>,        ← wall-clock timestamp
#     "elapsed_s":  <integer>,             ← seconds since monitor start
#     "cpu_pct":    <float>,               ← process CPU % (momentary)
#     "rss_kb":     <integer>,             ← resident set size in KiB
#     "rss_mb":     <float>,               ← same, in MiB (convenience)
#     "fd_count":   <integer>,             ← open file descriptors for PID
#     "loadavg_1m": <float>,               ← system 1-min load average
#     "health_ok":  true|false,            ← HTTP 200 from health_url
#     "crash":      false                  ← true when PID disappears
#   }
#
# When a crash is detected a final record is written with crash:true, then
# the monitor exits.  The exit code is:
#   0  — process exited cleanly (PID gone after k6 run finished)
#   1  — unexpected exit (crash detected)
#   2  — bad arguments
#
# Compatibility: macOS (ps BSD, sysctl) and Linux (/proc, ps GNU).
#
set -euo pipefail

# ── Argument validation ───────────────────────────────────────────────────────

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <PID> <out.jsonl> [interval_s] [health_url]" >&2
  exit 2
fi

TARGET_PID="$1"
OUT_JSONL="$2"
INTERVAL_S="${3:-5}"
HEALTH_URL="${4:-http://localhost:8080/api/health}"

# Validate PID is numeric
if ! [[ "$TARGET_PID" =~ ^[0-9]+$ ]]; then
  echo "ERROR: PID must be a positive integer, got: $TARGET_PID" >&2
  exit 2
fi

# ── Detect OS ─────────────────────────────────────────────────────────────────

OS_TYPE="$(uname -s)"

# ── Helper: sample process stats ─────────────────────────────────────────────

sample_process() {
  local pid="$1"

  # Check liveness first (also used for crash detection below)
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "DEAD"
    return
  fi

  local cpu_pct rss_kb

  if [[ "$OS_TYPE" == "Darwin" ]]; then
    # macOS: ps -o %cpu,rss
    local psout
    psout="$(ps -o %cpu=,rss= -p "$pid" 2>/dev/null || true)"
    if [[ -z "$psout" ]]; then
      echo "DEAD"
      return
    fi
    cpu_pct="$(echo "$psout" | awk '{print $1}')"
    rss_kb="$(echo  "$psout" | awk '{print $2}')"
  else
    # Linux: read from /proc/<pid>/stat + /proc/<pid>/status
    if [[ ! -f "/proc/$pid/status" ]]; then
      echo "DEAD"
      return
    fi
    cpu_pct="$(ps -o %cpu= -p "$pid" 2>/dev/null | tr -d ' ' || echo '0')"
    rss_kb="$(awk '/VmRSS/ {print $2}' "/proc/$pid/status" 2>/dev/null || echo '0')"
  fi

  echo "${cpu_pct}:${rss_kb}"
}

# ── Helper: count open FDs ────────────────────────────────────────────────────

count_fds() {
  local pid="$1"
  local fd_count=0

  if [[ "$OS_TYPE" == "Darwin" ]]; then
    fd_count="$(lsof -p "$pid" 2>/dev/null | wc -l | tr -d ' ')" || fd_count=0
    # lsof includes a header line
    fd_count=$(( fd_count > 0 ? fd_count - 1 : 0 ))
  else
    if [[ -d "/proc/$pid/fd" ]]; then
      fd_count="$(ls "/proc/$pid/fd" 2>/dev/null | wc -l | tr -d ' ')" || fd_count=0
    fi
  fi

  echo "$fd_count"
}

# ── Helper: load average ──────────────────────────────────────────────────────

get_loadavg() {
  local la='0'
  if [[ "$OS_TYPE" == "Darwin" ]]; then
    la="$(sysctl -n vm.loadavg 2>/dev/null | awk '{print $2}')" || la='0'
  elif [[ -f /proc/loadavg ]]; then
    la="$(awk '{print $1}' /proc/loadavg)"
  fi
  echo "$la"
}

# ── Helper: health check ──────────────────────────────────────────────────────

check_health() {
  local url="$1"
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 3 --max-time 5 "$url" 2>/dev/null || echo '000')"
  if [[ "$code" == "200" ]]; then
    echo "true"
  else
    echo "false"
  fi
}

# ── Main loop ─────────────────────────────────────────────────────────────────

START_TS="$(date +%s)"
CRASH_EXIT=0

echo "[soak-monitor] Starting: PID=$TARGET_PID interval=${INTERVAL_S}s out=$OUT_JSONL" >&2
echo "[soak-monitor] Health URL: $HEALTH_URL" >&2

# Ensure output directory exists
mkdir -p "$(dirname "$OUT_JSONL")"

while true; do
  NOW="$(date +%s)"
  ELAPSED=$(( NOW - START_TS ))

  # ── Sample process ──────────────────────────────────────────────────────────
  PROC_STATS="$(sample_process "$TARGET_PID")"

  if [[ "$PROC_STATS" == "DEAD" ]]; then
    # Write crash record
    HEALTH="$(check_health "$HEALTH_URL")"
    LA="$(get_loadavg)"

    printf '{"ts":%d,"elapsed_s":%d,"cpu_pct":0,"rss_kb":0,"rss_mb":0,"fd_count":0,"loadavg_1m":%s,"health_ok":%s,"crash":true}\n' \
      "$NOW" "$ELAPSED" "$LA" "false" \
      >> "$OUT_JSONL"

    echo "[soak-monitor] PID $TARGET_PID disappeared at elapsed=${ELAPSED}s — CRASH detected" >&2
    CRASH_EXIT=1
    break
  fi

  CPU_PCT="$(echo "$PROC_STATS" | cut -d: -f1)"
  RSS_KB="$(echo  "$PROC_STATS" | cut -d: -f2)"
  RSS_MB="$(awk "BEGIN {printf \"%.2f\", $RSS_KB / 1024}")"

  # ── FD count ────────────────────────────────────────────────────────────────
  FD_COUNT="$(count_fds "$TARGET_PID")"

  # ── Load average ────────────────────────────────────────────────────────────
  LOADAVG="$(get_loadavg)"

  # ── Health check ────────────────────────────────────────────────────────────
  HEALTH_OK="$(check_health "$HEALTH_URL")"

  # ── Write JSONL record ──────────────────────────────────────────────────────
  printf '{"ts":%d,"elapsed_s":%d,"cpu_pct":%s,"rss_kb":%s,"rss_mb":%s,"fd_count":%s,"loadavg_1m":%s,"health_ok":%s,"crash":false}\n' \
    "$NOW" "$ELAPSED" "$CPU_PCT" "$RSS_KB" "$RSS_MB" "$FD_COUNT" "$LOADAVG" "$HEALTH_OK" \
    >> "$OUT_JSONL"

  # ── Progress heartbeat every 60 samples ─────────────────────────────────────
  SAMPLE_NUM=$(( ELAPSED / INTERVAL_S ))
  if (( SAMPLE_NUM % 60 == 0 )) && (( ELAPSED > 0 )); then
    echo "[soak-monitor] elapsed=${ELAPSED}s cpu=${CPU_PCT}% rss=${RSS_MB}MiB fds=${FD_COUNT} health=${HEALTH_OK}" >&2
  fi

  sleep "$INTERVAL_S"
done

exit "$CRASH_EXIT"
