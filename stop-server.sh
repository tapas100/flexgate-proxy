#!/bin/bash

echo "Stopping FlexGate Proxy server..."
lsof -ti:8080 | xargs kill -9 2>/dev/null

if [ $? -eq 0 ]; then
    echo "✅ Server stopped successfully"
else
    echo "ℹ️  No server process found on port 8080"
fi
