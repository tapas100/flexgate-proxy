#!/bin/bash

# FlexGate - Status Check

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                        FlexGate - Status                             ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check FlexGate
echo -e "${CYAN}📊 Services:${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -f ".flexgate.pid" ]; then
    PID=$(cat .flexgate.pid)
    if kill -0 $PID 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} FlexGate running (PID: $PID)"
    else
        echo -e "  ${RED}✗${NC} FlexGate not running (stale PID file)"
    fi
else
    echo -e "  ${RED}✗${NC} FlexGate not running"
fi

if [ -f ".admin-ui.pid" ]; then
    PID=$(cat .admin-ui.pid)
    if kill -0 $PID 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} Admin UI running (PID: $PID)"
    else
        echo -e "  ${RED}✗${NC} Admin UI not running (stale PID file)"
    fi
else
    echo -e "  ${RED}✗${NC} Admin UI not running"
fi

echo ""
echo -e "${CYAN}🌐 Health Checks:${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    HEALTH=$(curl -s http://localhost:3000/health | jq -r '.status' 2>/dev/null || echo "UP")
    echo -e "  ${GREEN}✓${NC} FlexGate API: $HEALTH (http://localhost:3000)"
else
    echo -e "  ${RED}✗${NC} FlexGate API: Not accessible"
fi

if curl -s http://localhost:3002 > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} Admin UI: Accessible (http://localhost:3002)"
else
    echo -e "  ${RED}✗${NC} Admin UI: Not accessible"
fi

echo ""
echo -e "${CYAN}📖 Management Commands:${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Start:    npm run start:all"
echo "  Stop:     npm run stop:all"
echo "  Restart:  npm run restart:all"
echo "  Logs:     tail -f logs/flexgate.log"
echo ""
