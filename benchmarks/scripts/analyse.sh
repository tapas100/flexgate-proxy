#!/usr/bin/env bash
# benchmarks/scripts/analyse.sh
#
# Thin wrapper around analyse.js so CI and Makefiles can call a shell
# script without hard-coding the node path.
#
# Usage
# ─────
#   bash benchmarks/scripts/analyse.sh <run-dir>
#   bash benchmarks/scripts/analyse.sh <file1.json> [file2.json ...]
#   bash benchmarks/scripts/analyse.sh --stdout <run-dir>
#
# Output
# ──────
#   <run-dir>/summary.json   — structured JSON analysis
#   <run-dir>/report.md      — Markdown report (also printed to stdout)
#
# Exit codes
#   0  verdict = pass
#   1  verdict = fail (threshold breaches or overhead out of limits)
#   2  usage / missing files

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANALYSE_JS="$SCRIPT_DIR/analyse.js"

if [[ ! -f "$ANALYSE_JS" ]]; then
    echo "ERROR: analyse.js not found at $ANALYSE_JS" >&2
    exit 2
fi

if [[ $# -eq 0 ]]; then
    echo "Usage: analyse.sh [--stdout] <run-dir>" >&2
    echo "       analyse.sh [--stdout] <file1.json> [file2.json ...]" >&2
    exit 2
fi

# Run analysis — inherits stdout/stderr
node "$ANALYSE_JS" "$@"
exit $?
