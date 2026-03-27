#!/bin/bash

# FlexGate - Stop All Services and Dependencies

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${BLUE}==>${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                    FlexGate - Stop All Services                      ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Stop FlexGate API
if [ -f ".flexgate.pid" ]; then
    PID=$(cat .flexgate.pid)
    if kill -0 $PID 2>/dev/null; then
        print_status "Stopping FlexGate API (PID: $PID)..."
        kill $PID 2>/dev/null
        sleep 2
        if kill -0 $PID 2>/dev/null; then
            kill -9 $PID 2>/dev/null
        fi
        print_success "FlexGate API stopped"
    fi
    rm .flexgate.pid
fi

# Stop Admin UI
if [ -f ".admin-ui.pid" ]; then
    PID=$(cat .admin-ui.pid)
    if kill -0 $PID 2>/dev/null; then
        print_status "Stopping Admin UI (PID: $PID)..."
        kill $PID 2>/dev/null
        sleep 2
        if kill -0 $PID 2>/dev/null; then
            kill -9 $PID 2>/dev/null
        fi
        print_success "Admin UI stopped"
    fi
    rm .admin-ui.pid
fi

# Stop NATS
if [ -f ".nats.pid" ]; then
    PID=$(cat .nats.pid)
    if kill -0 $PID 2>/dev/null; then
        print_status "Stopping NATS (PID: $PID)..."
        kill $PID 2>/dev/null
        sleep 1
        print_success "NATS stopped"
    fi
    rm .nats.pid
fi

# Stop HAProxy
if [ -f ".haproxy.pid" ]; then
    PID=$(cat .haproxy.pid)
    if kill -0 $PID 2>/dev/null; then
        print_status "Stopping HAProxy (PID: $PID)..."
        kill $PID 2>/dev/null
        sleep 1
        print_success "HAProxy stopped"
    fi
    rm .haproxy.pid
fi

# Stop Prometheus
if [ -f ".prometheus.pid" ]; then
    PID=$(cat .prometheus.pid)
    if kill -0 $PID 2>/dev/null; then
        print_status "Stopping Prometheus (PID: $PID)..."
        kill $PID 2>/dev/null
        sleep 1
        print_success "Prometheus stopped"
    fi
    rm .prometheus.pid
fi

# Optional: Stop PostgreSQL and Redis (via Homebrew services)
echo ""
read -p "Stop PostgreSQL and Redis? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if command -v brew >/dev/null 2>&1; then
        if brew services list 2>/dev/null | grep postgresql | grep -q started; then
            print_status "Stopping PostgreSQL..."
            brew services stop postgresql@16 2>/dev/null || brew services stop postgresql 2>/dev/null
            print_success "PostgreSQL stopped"
        fi
        
        if brew services list 2>/dev/null | grep redis | grep -q started; then
            print_status "Stopping Redis..."
            brew services stop redis 2>/dev/null
            print_success "Redis stopped"
        fi
    fi
fi

echo ""
echo -e "${GREEN}✅ All services stopped${NC}"
echo ""

