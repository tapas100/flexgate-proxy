#!/bin/bash
# health-check.sh - Check health of all FlexGate services

echo "🏥 Running FlexGate health checks..."
echo ""

FAILED=0

# Check FlexGate API
echo "🔍 Checking FlexGate API..."
if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
    echo "   ✅ FlexGate API: healthy"
else
    echo "   ❌ FlexGate API: failed (http://localhost:3000/health)"
    FAILED=1
fi

# Check if running in process
if pgrep -f "node.*app.ts" > /dev/null || pgrep -f "node.*dist/app.js" > /dev/null; then
    echo "   ✅ FlexGate process: running"
else
    echo "   ⚠️  FlexGate process: not running"
fi

# Check PostgreSQL
echo ""
echo "🔍 Checking PostgreSQL..."
if command -v podman &> /dev/null; then
    if podman ps --filter "name=flexgate-postgres" --format "{{.Names}}" 2>/dev/null | grep -q postgres; then
        if podman exec flexgate-postgres pg_isready -U flexgate > /dev/null 2>&1; then
            echo "   ✅ PostgreSQL: healthy"
        else
            echo "   ❌ PostgreSQL: not ready"
            FAILED=1
        fi
    else
        echo "   ❌ PostgreSQL container: not running"
        FAILED=1
    fi
elif command -v docker &> /dev/null; then
    if docker ps --filter "name=flexgate-postgres" --format "{{.Names}}" 2>/dev/null | grep -q postgres; then
        if docker exec flexgate-postgres pg_isready -U flexgate > /dev/null 2>&1; then
            echo "   ✅ PostgreSQL: healthy"
        else
            echo "   ❌ PostgreSQL: not ready"
            FAILED=1
        fi
    else
        echo "   ❌ PostgreSQL container: not running"
        FAILED=1
    fi
else
    echo "   ⚠️  Podman/Docker not available, skipping container checks"
fi

# Check Redis
echo ""
echo "🔍 Checking Redis..."
if command -v podman &> /dev/null; then
    if podman ps --filter "name=flexgate-redis" --format "{{.Names}}" 2>/dev/null | grep -q redis; then
        if podman exec flexgate-redis redis-cli ping 2>/dev/null | grep -q PONG; then
            echo "   ✅ Redis: healthy"
        else
            echo "   ❌ Redis: not responding"
            FAILED=1
        fi
    else
        echo "   ❌ Redis container: not running"
        FAILED=1
    fi
elif command -v docker &> /dev/null; then
    if docker ps --filter "name=flexgate-redis" --format "{{.Names}}" 2>/dev/null | grep -q redis; then
        if docker exec flexgate-redis redis-cli ping 2>/dev/null | grep -q PONG; then
            echo "   ✅ Redis: healthy"
        else
            echo "   ❌ Redis: not responding"
            FAILED=1
        fi
    else
        echo "   ❌ Redis container: not running"
        FAILED=1
    fi
fi

# Check HAProxy (if production mode)
echo ""
echo "🔍 Checking HAProxy..."
if command -v podman &> /dev/null && podman ps --filter "name=flexgate-haproxy" --format "{{.Names}}" 2>/dev/null | grep -q haproxy; then
    if curl -sf http://localhost:8404/stats > /dev/null 2>&1; then
        echo "   ✅ HAProxy: healthy"
    else
        echo "   ⚠️  HAProxy stats: not accessible"
    fi
else
    echo "   ℹ️  HAProxy: not running (production mode only)"
fi

# Check Prometheus
echo ""
echo "🔍 Checking Prometheus..."
if curl -sf http://localhost:9090/-/healthy > /dev/null 2>&1; then
    echo "   ✅ Prometheus: healthy"
else
    echo "   ℹ️  Prometheus: not running (optional)"
fi

# Check Grafana
echo ""
echo "🔍 Checking Grafana..."
if curl -sf http://localhost:3001/api/health > /dev/null 2>&1; then
    echo "   ✅ Grafana: healthy"
else
    echo "   ℹ️  Grafana: not running (optional)"
fi

# Check Admin UI (if built)
echo ""
echo "🔍 Checking Admin UI..."
if [ -d "admin-ui/build" ]; then
    echo "   ✅ Admin UI: built"
elif [ -d "admin-ui/src" ]; then
    echo "   ⚠️  Admin UI: not built (run: cd admin-ui && npm run build)"
else
    echo "   ℹ️  Admin UI: not present"
fi

# Check log files
echo ""
echo "🔍 Checking logs..."
if [ -f "logs/error.log" ]; then
    ERROR_COUNT=$(wc -l < logs/error.log | tr -d ' ')
    if [ $ERROR_COUNT -gt 0 ]; then
        echo "   ⚠️  Error log has $ERROR_COUNT entries (last 3):"
        tail -3 logs/error.log | sed 's/^/      /'
    else
        echo "   ✅ No errors in log"
    fi
fi

# Summary
echo ""
echo "================================================"
if [ $FAILED -eq 0 ]; then
    echo "✅ All critical health checks passed!"
    echo ""
    echo "FlexGate URLs:"
    echo "  API:      http://localhost:3000"
    echo "  Admin UI: http://localhost:3001 (dev) or http://localhost:8080/admin (prod)"
    echo "  Metrics:  http://localhost:9090"
    echo "  Grafana:  http://localhost:3001"
    exit 0
else
    echo "❌ Some health checks failed!"
    echo ""
    echo "Quick fixes:"
    echo "  Start database:  npm run db:start"
    echo "  Start FlexGate:  npm start"
    echo "  Full restart:    npm run podman:stop && npm run db:start && npm start"
    exit 1
fi
