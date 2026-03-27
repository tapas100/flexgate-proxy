#!/bin/bash

# Kill any existing process on port 8080
echo "Checking for existing processes on port 8080..."
lsof -ti:8080 | xargs kill -9 2>/dev/null
sleep 2

# Start the server in background with nohup
echo "Starting FlexGate Proxy server..."
cd /Users/tamahant/Documents/GitHub/flexgate-proxy
nohup npm run dev > server-output.log 2>&1 &

# Wait for server to start
sleep 5

# Check if server is running
if lsof -ti:8080 > /dev/null 2>&1; then
    echo "✅ Server started successfully on port 8080"
    echo "📋 Logs: tail -f server-output.log"
else
    echo "❌ Server failed to start. Check server-output.log for details"
fi
