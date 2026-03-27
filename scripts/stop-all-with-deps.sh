#!/bin/bash
# stop-all-with-deps.sh - Stop all FlexGate services and dependencies

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

print_header() {
    echo ""
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║              FlexGate - Stop All Services & Dependencies            ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_status() { echo -e "${CYAN}==>${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }

print_header

# Determine container runtime
RUNTIME=""
COMPOSE_CMD=""
if command -v podman &> /dev/null; then
    RUNTIME="podman"
    if command -v podman-compose &> /dev/null; then
        COMPOSE_CMD="podman-compose"
    fi
elif command -v docker &> /dev/null; then
    RUNTIME="docker"
    if command -v docker-compose &> /dev/null; then
        COMPOSE_CMD="docker-compose"
    fi
fi

# ============================================
# 1. STOP APPLICATION SERVICES
# ============================================

print_status "Stopping application services..."
echo ""

# Stop Admin UI
print_status "Stopping Admin UI..."
if pgrep -f "react-scripts start" > /dev/null || pgrep -f "webpack.*dev.*server" > /dev/null; then
    pkill -f "react-scripts start" 2>/dev/null
    pkill -f "webpack.*dev.*server" 2>/dev/null
    sleep 1
    print_success "Admin UI stopped"
else
    print_warning "Admin UI not running"
fi

# Stop FlexGate API
print_status "Stopping FlexGate API..."
if pgrep -f "node.*app.ts\|node.*dist/app.js\|node.*bin/www\|ts-node.*bin/www" > /dev/null; then
    pkill -9 -f "node.*app.ts" 2>/dev/null
    pkill -9 -f "node.*dist/app.js" 2>/dev/null
    pkill -9 -f "node.*bin/www" 2>/dev/null
    pkill -9 -f "ts-node.*bin/www" 2>/dev/null
    sleep 1
    print_success "FlexGate API stopped"
else
    print_warning "FlexGate API not running"
fi

# Stop any other Node processes in the project
print_status "Cleaning up other Node processes..."
if pgrep -f "node.*flexgate" > /dev/null; then
    pkill -9 -f "node.*flexgate" 2>/dev/null
    sleep 1
    print_success "Cleaned up additional processes"
fi

echo ""

# ============================================
# 2. STOP CONTAINER DEPENDENCIES
# ============================================

if [ -n "$RUNTIME" ]; then
    print_status "Stopping container dependencies..."
    echo ""
    
    # Stop HAProxy
    print_status "Stopping HAProxy..."
    if $RUNTIME ps --filter "name=flexgate-haproxy" --format "{{.Names}}" 2>/dev/null | grep -q haproxy; then
        $RUNTIME stop flexgate-haproxy 2>/dev/null
        print_success "HAProxy stopped"
    else
        print_warning "HAProxy not running"
    fi
    
    # Stop Prometheus
    print_status "Stopping Prometheus..."
    if $RUNTIME ps --filter "name=flexgate-prometheus" --format "{{.Names}}" 2>/dev/null | grep -q prometheus; then
        $RUNTIME stop flexgate-prometheus 2>/dev/null
        print_success "Prometheus stopped"
    else
        print_warning "Prometheus not running"
    fi
    
    # Stop Redis
    print_status "Stopping Redis..."
    if $RUNTIME ps --filter "name=flexgate-redis" --format "{{.Names}}" 2>/dev/null | grep -q redis; then
        $RUNTIME stop flexgate-redis 2>/dev/null
        print_success "Redis stopped"
    else
        print_warning "Redis not running"
    fi
    
    # Stop PostgreSQL
    print_status "Stopping PostgreSQL..."
    if $RUNTIME ps --filter "name=flexgate-postgres" --format "{{.Names}}" 2>/dev/null | grep -q postgres; then
        $RUNTIME stop flexgate-postgres 2>/dev/null
        print_success "PostgreSQL stopped"
    else
        print_warning "PostgreSQL not running"
    fi
    
    echo ""
    
    # Optional: Remove containers (commented out by default)
    # Uncomment to remove containers completely
    # print_status "Removing containers..."
    # $RUNTIME rm -f flexgate-postgres flexgate-redis flexgate-haproxy flexgate-prometheus 2>/dev/null
    # print_success "Containers removed"
    
else
    print_warning "No container runtime found (podman/docker)"
fi

# ============================================
# 3. VERIFY ALL STOPPED
# ============================================

print_status "Verifying all services stopped..."
echo ""

SERVICES_RUNNING=0

# Check ports
if lsof -ti:3000 > /dev/null 2>&1; then
    print_warning "Port 3000 still in use"
    SERVICES_RUNNING=1
else
    print_success "Port 3000 free"
fi

if lsof -ti:3001 > /dev/null 2>&1; then
    print_warning "Port 3001 still in use"
    SERVICES_RUNNING=1
else
    print_success "Port 3001 free"
fi

if lsof -ti:5432 > /dev/null 2>&1; then
    # Check if it's the FlexGate container
    if [ -n "$RUNTIME" ] && $RUNTIME ps --filter "name=flexgate-postgres" --format "{{.Names}}" 2>/dev/null | grep -q postgres; then
        print_warning "PostgreSQL container still running"
        SERVICES_RUNNING=1
    else
        print_success "Port 5432 available (external PostgreSQL may be running)"
    fi
else
    print_success "Port 5432 free"
fi

if lsof -ti:6379 > /dev/null 2>&1; then
    # Check if it's the FlexGate container
    if [ -n "$RUNTIME" ] && $RUNTIME ps --filter "name=flexgate-redis" --format "{{.Names}}" 2>/dev/null | grep -q redis; then
        print_warning "Redis container still running"
        SERVICES_RUNNING=1
    else
        print_success "Port 6379 available (external Redis may be running)"
    fi
else
    print_success "Port 6379 free"
fi

echo ""

# ============================================
# SUMMARY
# ============================================

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                              SUMMARY                                 ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ $SERVICES_RUNNING -eq 0 ]; then
    print_success "All FlexGate services stopped successfully"
    echo ""
    echo "To start services again:"
    echo "  ./scripts/start-all-with-deps.sh"
    exit 0
else
    print_warning "Some services may still be running"
    echo ""
    echo "Force kill all processes:"
    echo "  pkill -9 -f flexgate"
    echo ""
    echo "Stop containers manually:"
    echo "  podman stop flexgate-postgres flexgate-redis flexgate-haproxy flexgate-prometheus"
    exit 1
fi
