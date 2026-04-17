#!/bin/bash
# Start the Admin UI dev server.
# Proxy: /api/* → localhost:8080 (Go admin API).

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Kill anything already on port 3000.
OLD_PID=$(lsof -ti TCP:3000 2>/dev/null || true)
if [ -n "$OLD_PID" ]; then
  echo "Killing existing process on :3000 (PID $OLD_PID)..."
  kill -9 $OLD_PID 2>/dev/null || true
  sleep 1
fi

echo "Starting Admin UI dev server on http://localhost:3000"
echo "API proxy → http://localhost:8080"
echo ""

PORT=3000 BROWSER=none node_modules/.bin/react-scripts start
