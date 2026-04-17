#!/usr/bin/env bash
# benchmarks/scripts/collect-metrics.sh
#
# Background system metrics sampler.
# Samples CPU% and RSS of a given PID every second and writes a JSONL
# stream to a file.  run-all.sh starts this before each scenario and
# kills it after.  compare.js reads the JSONL to compute mean/max.
#
# Usage:
#   # Start in background
#   bash benchmarks/scripts/collect-metrics.sh <PID> <outfile.jsonl> &
#   SAMPLER_PID=$!
#
#   # ... run benchmark ...
#
#   kill $SAMPLER_PID
#
# Output format (one JSON object per line):
#   {"ts":1712345678,"cpu_pct":12.3,"rss_kb":45678,"loadavg_1min":1.23}

set -euo pipefail

TARGET_PID="${1:?Usage: collect-metrics.sh <pid> <outfile.jsonl>}"
OUT_FILE="${2:?Usage: collect-metrics.sh <pid> <outfile.jsonl>}"
INTERVAL="${3:-1}"   # sampling interval in seconds, default 1

# Validate PID exists
if ! kill -0 "$TARGET_PID" 2>/dev/null; then
    echo "[collect-metrics] PID $TARGET_PID not running — exiting" >&2
    exit 1
fi

echo "[collect-metrics] sampling PID=$TARGET_PID → $OUT_FILE  interval=${INTERVAL}s" >&2

# Truncate / create output file
: > "$OUT_FILE"

while kill -0 "$TARGET_PID" 2>/dev/null; do
    TS=$(date +%s)

    # CPU% and RSS — portable across macOS (ps BSD) and Linux (ps GNU)
    if [[ "$(uname)" == "Darwin" ]]; then
        READ=$(ps -p "$TARGET_PID" -o %cpu=,rss= 2>/dev/null || echo "0 0")
    else
        READ=$(ps -p "$TARGET_PID" -o %cpu=,rss= --no-headers 2>/dev/null || echo "0 0")
    fi

    CPU_PCT=$(echo "$READ" | awk '{print $1}')
    RSS_KB=$(echo "$READ" | awk  '{print $2}')

    # Load average (1-min)
    if [[ "$(uname)" == "Darwin" ]]; then
        LOADAVG=$(sysctl -n vm.loadavg 2>/dev/null | awk '{print $2}')
    else
        LOADAVG=$(cat /proc/loadavg 2>/dev/null | awk '{print $1}')
    fi

    printf '{"ts":%d,"cpu_pct":%s,"rss_kb":%s,"loadavg_1min":%s}\n' \
        "$TS" "${CPU_PCT:-0}" "${RSS_KB:-0}" "${LOADAVG:-0}" \
        >> "$OUT_FILE"

    sleep "$INTERVAL"
done

echo "[collect-metrics] PID $TARGET_PID gone — sampler exiting" >&2
