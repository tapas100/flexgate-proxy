#!/bin/bash
# health-check.sh - Check health of all FlexGate services

# Check for JSON output flag
JSON_MODE=false
if [ "$1" = "--json" ]; then
    JSON_MODE=true
fi

# JSON output array
declare -a JSON_SERVICES=()

# Helper function to add service to JSON
add_json_service() {
    local name="$1"
    local status="$2"
    local mode="$3"
    local message="$4"
    JSON_SERVICES+=("{\"name\":\"$name\",\"status\":\"$status\",\"mode\":\"$mode\",\"message\":\"$message\"}")
}

# Only show header in text mode
if [ "$JSON_MODE" = false ]; then
    echo "🏥 FlexGate Service Health"
    echo ""
fi

FAILED=0

# Check FlexGate API
if curl -sf http://localhost:8080/health > /dev/null 2>&1; then
    if [ "$JSON_MODE" = false ]; then
        echo "✅ FlexGate API: healthy"
    fi
    add_json_service "FlexGate API" "healthy" "native" "healthy"
else
    if [ "$JSON_MODE" = false ]; then
        echo "❌ FlexGate API: failed"
    fi
    add_json_service "FlexGate API" "unhealthy" "native" "failed"
    FAILED=1
fi

# Check if running in process (text mode only)
if [ "$JSON_MODE" = false ]; then
    if pgrep -f "node.*app.ts" > /dev/null || pgrep -f "node.*dist/app.js" > /dev/null; then
        echo "   └─ Process: running"
    else
        echo "   └─ Process: not running"
    fi
fi

# Check PostgreSQL
# Priority order: Podman -> Docker -> Native
if command -v podman &> /dev/null && podman ps --filter "name=flexgate-postgres" --format "{{.Names}}" 2>/dev/null | grep -q postgres; then
    if podman exec flexgate-postgres pg_isready -U flexgate > /dev/null 2>&1; then
        [ "$JSON_MODE" = false ] && echo "✅ PostgreSQL: healthy [podman]"
        add_json_service "PostgreSQL" "healthy" "podman" "healthy"
    else
        [ "$JSON_MODE" = false ] && echo "❌ PostgreSQL: not ready [podman]"
        add_json_service "PostgreSQL" "unhealthy" "podman" "not ready"
        FAILED=1
    fi
elif command -v docker &> /dev/null && docker ps --filter "name=flexgate-postgres" --format "{{.Names}}" 2>/dev/null | grep -q postgres; then
    if docker exec flexgate-postgres pg_isready -U flexgate > /dev/null 2>&1; then
        [ "$JSON_MODE" = false ] && echo "✅ PostgreSQL: healthy [docker]"
        add_json_service "PostgreSQL" "healthy" "docker" "healthy"
    else
        [ "$JSON_MODE" = false ] && echo "❌ PostgreSQL: not ready [docker]"
        add_json_service "PostgreSQL" "unhealthy" "docker" "not ready"
        FAILED=1
    fi
elif command -v pg_isready &> /dev/null && pg_isready -q 2>/dev/null; then
    [ "$JSON_MODE" = false ] && echo "✅ PostgreSQL: healthy [native]"
    add_json_service "PostgreSQL" "healthy" "native" "healthy"
else
    [ "$JSON_MODE" = false ] && echo "❌ PostgreSQL: not running"
    add_json_service "PostgreSQL" "unhealthy" "none" "not running"
    FAILED=1
fi

# Check Redis
# Priority order: Podman -> Docker -> Native
if command -v podman &> /dev/null && podman ps --filter "name=flexgate-redis" --format "{{.Names}}" 2>/dev/null | grep -q redis; then
    if podman exec flexgate-redis redis-cli ping 2>/dev/null | grep -q PONG; then
        [ "$JSON_MODE" = false ] && echo "✅ Redis: healthy [podman]"
        add_json_service "Redis" "healthy" "podman" "healthy"
    else
        [ "$JSON_MODE" = false ] && echo "❌ Redis: not responding [podman]"
        add_json_service "Redis" "unhealthy" "podman" "not responding"
        FAILED=1
    fi
elif command -v docker &> /dev/null && docker ps --filter "name=flexgate-redis" --format "{{.Names}}" 2>/dev/null | grep -q redis; then
    if docker exec flexgate-redis redis-cli ping 2>/dev/null | grep -q PONG; then
        [ "$JSON_MODE" = false ] && echo "✅ Redis: healthy [docker]"
        add_json_service "Redis" "healthy" "docker" "healthy"
    else
        [ "$JSON_MODE" = false ] && echo "❌ Redis: not responding [docker]"
        add_json_service "Redis" "unhealthy" "docker" "not responding"
        FAILED=1
    fi
elif command -v redis-cli &> /dev/null && redis-cli ping 2>/dev/null | grep -q PONG; then
    [ "$JSON_MODE" = false ] && echo "✅ Redis: healthy [native]"
    add_json_service "Redis" "healthy" "native" "healthy"
else
    [ "$JSON_MODE" = false ] && echo "⚠️  Redis: not running [optional]"
    add_json_service "Redis" "warning" "none" "not running (optional)"
fi

# Check HAProxy (if production mode)
if command -v podman &> /dev/null && podman ps --filter "name=flexgate-haproxy" --format "{{.Names}}" 2>/dev/null | grep -q haproxy; then
    if curl -sf -u admin:admin http://localhost:8404/stats > /dev/null 2>&1; then
        [ "$JSON_MODE" = false ] && echo "✅ HAProxy: healthy [podman]"
        add_json_service "HAProxy" "healthy" "podman" "healthy"
    else
        [ "$JSON_MODE" = false ] && echo "⚠️  HAProxy: stats not accessible [podman]"
        add_json_service "HAProxy" "warning" "podman" "stats not accessible"
    fi
elif curl -sf -u admin:admin http://localhost:8404/stats > /dev/null 2>&1; then
    [ "$JSON_MODE" = false ] && echo "✅ HAProxy: running [native]"
    add_json_service "HAProxy" "healthy" "native" "running"
else
    [ "$JSON_MODE" = false ] && echo "ℹ️  HAProxy: not running [optional]"
    add_json_service "HAProxy" "warning" "none" "not running (optional)"
fi

# Check Prometheus
if curl -sf http://localhost:9090/-/healthy > /dev/null 2>&1; then
    [ "$JSON_MODE" = false ] && echo "✅ Prometheus: healthy [native]"
    add_json_service "Prometheus" "healthy" "native" "healthy"
else
    [ "$JSON_MODE" = false ] && echo "ℹ️  Prometheus: not running [optional]"
    add_json_service "Prometheus" "warning" "none" "not running (optional)"
fi

# Check Admin UI (if built)
if [ -d "admin-ui/build" ]; then
    [ "$JSON_MODE" = false ] && echo "✅ Admin UI: built"
    add_json_service "Admin UI" "healthy" "native" "built"
elif [ -d "admin-ui/src" ]; then
    [ "$JSON_MODE" = false ] && echo "⚠️  Admin UI: not built (run: cd admin-ui && npm run build)"
    add_json_service "Admin UI" "warning" "native" "not built"
else
    [ "$JSON_MODE" = false ] && echo "ℹ️  Admin UI: not present"
    add_json_service "Admin UI" "warning" "none" "not present"
fi

# Output JSON or text summary
if [ "$JSON_MODE" = true ]; then
    # JSON output
    echo "{"
    echo "  \"timestamp\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\","
    echo "  \"success\": $([ $FAILED -eq 0 ] && echo "true" || echo "false"),"
    echo "  \"services\": ["
    
    for i in "${!JSON_SERVICES[@]}"; do
        if [ $i -eq $((${#JSON_SERVICES[@]} - 1)) ]; then
            echo "    ${JSON_SERVICES[$i]}"
        else
            echo "    ${JSON_SERVICES[$i]},"
        fi
    done
    
    echo "  ]"
    echo "}"
else
    # Text output summary
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Check log files
    if [ -f "logs/error.log" ]; then
        ERROR_COUNT=$(wc -l < logs/error.log | tr -d ' ')
        if [ $ERROR_COUNT -gt 0 ]; then
            echo "⚠️  Error log has $ERROR_COUNT entries (last 3):"
            tail -3 logs/error.log | sed 's/^/   /'
        else
            echo "✅ No errors in log"
        fi
    fi

    # Summary
    echo ""
    if [ $FAILED -eq 0 ]; then
        echo "✅ All critical services healthy"
        echo ""
        echo "Access Points:"
        echo "  • API:       http://localhost:8080"
        echo "  • Admin UI:  http://localhost:3001"
        echo "  • HAProxy:   http://localhost:8404/stats (if running)"
        echo "  • Metrics:   http://localhost:9090 (if running)"
    else
        echo "❌ Some critical services failed"
        echo ""
        echo "Quick fixes:"
        echo "  • Start all: ./scripts/start-with-deps.sh"
        echo "  • Check logs: tail -f logs/flexgate.log"
    fi
fi

exit $FAILED
