#!/bin/bash
# health-check-json.sh - Check health of all FlexGate services and output JSON

# Initialize results array
SERVICES=()

# Helper function to add service status
add_service() {
    local name="$1"
    local status="$2"
    local mode="$3"
    local message="$4"
    
    SERVICES+=("{\"name\":\"$name\",\"status\":\"$status\",\"mode\":\"$mode\",\"message\":\"$message\"}")
}

# Check FlexGate API
if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
    add_service "FlexGate API" "healthy" "native" "healthy"
else
    add_service "FlexGate API" "unhealthy" "native" "failed"
fi

# Check PostgreSQL (Priority: Podman -> Docker -> Native)
if command -v podman &> /dev/null && podman ps --filter "name=flexgate-postgres" --format "{{.Names}}" 2>/dev/null | grep -q postgres; then
    if podman exec flexgate-postgres pg_isready -U flexgate > /dev/null 2>&1; then
        add_service "PostgreSQL" "healthy" "podman" "healthy"
    else
        add_service "PostgreSQL" "unhealthy" "podman" "not ready"
    fi
elif command -v docker &> /dev/null && docker ps --filter "name=flexgate-postgres" --format "{{.Names}}" 2>/dev/null | grep -q postgres; then
    if docker exec flexgate-postgres pg_isready -U flexgate > /dev/null 2>&1; then
        add_service "PostgreSQL" "healthy" "docker" "healthy"
    else
        add_service "PostgreSQL" "unhealthy" "docker" "not ready"
    fi
elif command -v pg_isready &> /dev/null && pg_isready -q 2>/dev/null; then
    add_service "PostgreSQL" "healthy" "native" "healthy"
else
    add_service "PostgreSQL" "unhealthy" "none" "not running"
fi

# Check Redis (Priority: Podman -> Docker -> Native)
if command -v podman &> /dev/null && podman ps --filter "name=flexgate-redis" --format "{{.Names}}" 2>/dev/null | grep -q redis; then
    if podman exec flexgate-redis redis-cli ping 2>/dev/null | grep -q PONG; then
        add_service "Redis" "healthy" "podman" "healthy"
    else
        add_service "Redis" "unhealthy" "podman" "not responding"
    fi
elif command -v docker &> /dev/null && docker ps --filter "name=flexgate-redis" --format "{{.Names}}" 2>/dev/null | grep -q redis; then
    if docker exec flexgate-redis redis-cli ping 2>/dev/null | grep -q PONG; then
        add_service "Redis" "healthy" "docker" "healthy"
    else
        add_service "Redis" "unhealthy" "docker" "not responding"
    fi
elif command -v redis-cli &> /dev/null && redis-cli ping 2>/dev/null | grep -q PONG; then
    add_service "Redis" "healthy" "native" "healthy"
else
    add_service "Redis" "warning" "none" "not running (optional)"
fi

# Check HAProxy (Priority: Podman -> Docker -> Native)
if command -v podman &> /dev/null && podman ps --filter "name=flexgate-haproxy" --format "{{.Names}}" 2>/dev/null | grep -q haproxy; then
    if curl -sf http://localhost:8404/stats > /dev/null 2>&1; then
        add_service "HAProxy" "healthy" "podman" "healthy"
    else
        add_service "HAProxy" "warning" "podman" "stats not accessible"
    fi
elif lsof -ti :8080 >/dev/null 2>&1; then
    add_service "HAProxy" "healthy" "native" "running"
else
    add_service "HAProxy" "warning" "none" "not running (optional)"
fi

# Check Prometheus
if curl -sf http://localhost:9090/-/healthy > /dev/null 2>&1; then
    add_service "Prometheus" "healthy" "native" "healthy"
else
    add_service "Prometheus" "warning" "none" "not running (optional)"
fi

# Build JSON output
echo "{"
echo "  \"timestamp\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\","
echo "  \"services\": ["

# Output services with proper comma handling
for i in "${!SERVICES[@]}"; do
    if [ $i -eq $((${#SERVICES[@]} - 1)) ]; then
        echo "    ${SERVICES[$i]}"
    else
        echo "    ${SERVICES[$i]},"
    fi
done

echo "  ]"
echo "}"
