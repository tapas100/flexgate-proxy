#!/bin/bash

# Proxy Server Benchmark Suite

set -e

echo "🚀 Starting benchmark suite..."
echo ""

# Check if wrk is installed
if ! command -v wrk &> /dev/null; then
    echo "❌ wrk is not installed. Install it with:"
    echo "   macOS: brew install wrk"
    echo "   Linux: sudo apt-get install wrk"
    exit 1
fi

# Configuration
PROXY_URL="http://localhost:3000"
DURATION="30s"
THREADS=4
CONNECTIONS=100

echo "Configuration:"
echo "  Proxy URL: $PROXY_URL"
echo "  Duration: $DURATION"
echo "  Threads: $THREADS"
echo "  Connections: $CONNECTIONS"
echo ""

# Check if proxy is running
if ! curl -s "$PROXY_URL/health/live" > /dev/null; then
    echo "❌ Proxy server is not running at $PROXY_URL"
    echo "   Start it with: npm start"
    exit 1
fi

echo "✅ Proxy server is running"
echo ""

# Run benchmarks
echo "📊 Running benchmarks..."
echo ""

echo "=== Baseline Test (Simple GET) ==="
wrk -t$THREADS -c$CONNECTIONS -d$DURATION "$PROXY_URL/httpbin/get"
echo ""

echo "=== With Rate Limiting ==="
wrk -t$THREADS -c$CONNECTIONS -d$DURATION "$PROXY_URL/api/users/1"
echo ""

echo "=== Large Payload (10KB) ==="
wrk -t$THREADS -c$CONNECTIONS -d$DURATION "$PROXY_URL/httpbin/bytes/10240"
echo ""

echo "=== High Concurrency (500 connections) ==="
wrk -t8 -c500 -d$DURATION "$PROXY_URL/httpbin/get"
echo ""

echo "✅ Benchmark suite completed!"
echo ""
echo "📈 Check logs/ directory for detailed results"
