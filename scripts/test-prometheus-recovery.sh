#!/bin/bash

# Test script for Prometheus auto-recovery
# This simulates the Prometheus recovery section only

echo "🧪 Testing Prometheus Auto-Recovery"
echo "===================================="
echo ""

RECOVERY_NEEDED=0

# 4. Check Prometheus (if installed)
echo ""
echo "🔍 Checking Prometheus..."
if command -v prometheus &> /dev/null; then
    if ! curl -sf http://localhost:9090/-/healthy > /dev/null 2>&1; then
        echo "   ❌ Prometheus is down or not responding"
        
        # Check if process is running
        if [ -f ".prometheus.pid" ]; then
            PROM_PID=$(cat .prometheus.pid)
            if ! ps -p $PROM_PID > /dev/null 2>&1; then
                echo "   🔧 Starting Prometheus..."
                
                # Start Prometheus with development config
                if [ -f "infra/prometheus/prometheus.dev.yml" ]; then
                    nohup prometheus --config.file=infra/prometheus/prometheus.dev.yml --storage.tsdb.path=./logs/prometheus > logs/prometheus.log 2>&1 &
                    echo $! > .prometheus.pid
                    sleep 2
                    RECOVERY_NEEDED=1
                    
                    if curl -sf http://localhost:9090/-/healthy > /dev/null 2>&1; then
                        echo "   ✅ Prometheus started successfully (PID: $(cat .prometheus.pid))"
                    else
                        echo "   ⚠️  Prometheus may need more time to start (check logs/prometheus.log)"
                    fi
                elif [ -f "infra/prometheus/prometheus.yml" ]; then
                    nohup prometheus --config.file=infra/prometheus/prometheus.yml --storage.tsdb.path=./logs/prometheus > logs/prometheus.log 2>&1 &
                    echo $! > .prometheus.pid
                    sleep 2
                    RECOVERY_NEEDED=1
                    
                    if curl -sf http://localhost:9090/-/healthy > /dev/null 2>&1; then
                        echo "   ✅ Prometheus started successfully (PID: $(cat .prometheus.pid))"
                    else
                        echo "   ⚠️  Prometheus may need more time to start (check logs/prometheus.log)"
                    fi
                else
                    echo "   ⚠️  Prometheus config not found (skipping)"
                fi
            else
                echo "   ⚠️  Prometheus process running but not responding, restarting..."
                kill $PROM_PID 2>/dev/null
                sleep 1
                
                if [ -f "infra/prometheus/prometheus.dev.yml" ]; then
                    nohup prometheus --config.file=infra/prometheus/prometheus.dev.yml --storage.tsdb.path=./logs/prometheus > logs/prometheus.log 2>&1 &
                elif [ -f "infra/prometheus/prometheus.yml" ]; then
                    nohup prometheus --config.file=infra/prometheus/prometheus.yml --storage.tsdb.path=./logs/prometheus > logs/prometheus.log 2>&1 &
                fi
                echo $! > .prometheus.pid
                sleep 2
                RECOVERY_NEEDED=1
            fi
        else
            echo "   🔧 Starting Prometheus (no PID file found)..."
            
            if [ -f "infra/prometheus/prometheus.dev.yml" ]; then
                nohup prometheus --config.file=infra/prometheus/prometheus.dev.yml --storage.tsdb.path=./logs/prometheus > logs/prometheus.log 2>&1 &
            elif [ -f "infra/prometheus/prometheus.yml" ]; then
                nohup prometheus --config.file=infra/prometheus/prometheus.yml --storage.tsdb.path=./logs/prometheus > logs/prometheus.log 2>&1 &
            else
                echo "   ⚠️  Prometheus config not found (skipping)"
                echo ""
                echo "   To enable Prometheus:"
                echo "     1. Install: brew install prometheus"
                echo "     2. Ensure config exists at: infra/prometheus/prometheus.dev.yml"
                exit 0
            fi
            echo $! > .prometheus.pid
            sleep 2
            RECOVERY_NEEDED=1
        fi
    else
        echo "   ✅ Prometheus is healthy"
    fi
else
    echo "   ℹ️  Prometheus not installed (optional)"
fi

echo ""
echo "===================================="
if [ $RECOVERY_NEEDED -eq 1 ]; then
    echo "✅ Recovery performed"
    echo ""
    echo "Verify:"
    echo "  • Prometheus UI: http://localhost:9090"
    echo "  • Health check: curl http://localhost:9090/-/healthy"
    echo "  • Logs: tail -f logs/prometheus.log"
else
    echo "✅ No recovery needed"
fi
