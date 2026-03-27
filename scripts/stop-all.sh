#!/bin/bash

# FlexGate - Stop All Services

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}Stopping FlexGate services...${NC}"
echo ""

# Stop FlexGate
if [ -f ".flexgate.pid" ]; then
    PID=$(cat .flexgate.pid)
    if kill -0 $PID 2>/dev/null; then
        echo -e "${GREEN}✓${NC} Stopping FlexGate (PID: $PID)"
        kill $PID
    fi
    rm .flexgate.pid
fi

# Stop Admin UI
if [ -f ".admin-ui.pid" ]; then
    PID=$(cat .admin-ui.pid)
    if kill -0 $PID 2>/dev/null; then
        echo -e "${GREEN}✓${NC} Stopping Admin UI (PID: $PID)"
        kill $PID
    fi
    rm .admin-ui.pid
fi

echo ""
echo -e "${GREEN}✅ All services stopped${NC}"
echo ""
