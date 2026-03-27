#!/bin/bash
# Quick script to start Prometheus

echo "🔍 Starting Prometheus..."

# Check if Podman machine is running
if ! podman machine list 2>/dev/null | grep -q "Currently running"; then
    echo "⚠️  Podman machine not running - starting..."
    podman machine start
    sleep 3
fi

# Check if Prometheus is already running
if podman ps --filter "name=flexgate-prometheus" --format "{{.Names}}" 2>/dev/null | grep -q prometheus; then
    echo "✅ Prometheus already running"
    exit 0
fi

# Start Prometheus
echo "🚀 Starting Prometheus container..."
podman run -d \
    --name flexgate-prometheus \
    -p 9090:9090 \
    -v "$(pwd)/infra/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro" \
    prom/prometheus:latest \
    --config.file=/etc/prometheus/prometheus.yml \
    --storage.tsdb.path=/prometheus

if [ $? -eq 0 ]; then
    echo "✅ Prometheus started successfully"
    echo "📊 Access at: http://localhost:9090"
else
    echo "❌ Failed to start Prometheus"
    exit 1
fi
