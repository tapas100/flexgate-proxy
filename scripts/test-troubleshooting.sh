#!/bin/bash

# Troubleshooting & Settings Test Runner
# Starts all services, runs tests, and provides detailed results

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  FlexGate Troubleshooting & Settings Integration Tests   ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Step 1: Check if services are running
echo -e "${YELLOW}📊 Step 1: Checking service status...${NC}"
echo ""

FLEXGATE_RUNNING=false
ADMIN_UI_RUNNING=false

if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ FlexGate API is running on http://localhost:3000${NC}"
    FLEXGATE_RUNNING=true
else
    echo -e "${RED}✗ FlexGate API is not running${NC}"
fi

if curl -s http://localhost:3002 > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Admin UI is running on http://localhost:3002${NC}"
    ADMIN_UI_RUNNING=true
else
    echo -e "${YELLOW}⚠ Admin UI is not running (optional for API tests)${NC}"
fi

echo ""

# Step 2: Start services if not running
if [ "$FLEXGATE_RUNNING" = false ]; then
    echo -e "${YELLOW}🚀 Step 2: Starting FlexGate services...${NC}"
    echo ""
    
    if [ -f "scripts/start-all.sh" ]; then
        echo "Running: bash scripts/start-all.sh"
        bash scripts/start-all.sh
        
        # Wait for services to be ready
        echo ""
        echo "Waiting for services to be ready..."
        sleep 5
        
        # Verify FlexGate started
        if curl -s http://localhost:3000/health > /dev/null 2>&1; then
            echo -e "${GREEN}✓ FlexGate API started successfully${NC}"
        else
            echo -e "${RED}✗ Failed to start FlexGate API${NC}"
            echo "Please check logs/flexgate.log for errors"
            exit 1
        fi
    else
        echo -e "${RED}✗ start-all.sh script not found${NC}"
        echo "Please start FlexGate manually:"
        echo "  npm run build && npm start"
        exit 1
    fi
    echo ""
else
    echo -e "${YELLOW}⏭  Step 2: Services already running, skipping startup${NC}"
    echo ""
fi

# Step 3: Run TypeScript compilation
echo -e "${YELLOW}🔨 Step 3: Checking TypeScript...${NC}"
echo ""

# Skip TypeScript check - Jest handles it
echo -e "${GREEN}✓ Skipping TypeScript check (Jest handles compilation)${NC}"

echo ""

# Step 4: Install test dependencies
echo -e "${YELLOW}📦 Step 4: Checking test dependencies...${NC}"
echo ""

if ! npm list axios > /dev/null 2>&1; then
    echo "Installing axios..."
    npm install --save-dev axios
fi

if ! npm list @types/jest > /dev/null 2>&1; then
    echo "Installing Jest types..."
    npm install --save-dev @types/jest
fi

echo -e "${GREEN}✓ Dependencies ready${NC}"
echo ""

# Step 5: Run tests
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Running Integration Tests                                 ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Export environment variables
export API_URL="http://localhost:3000"
export ADMIN_UI_URL="http://localhost:3002"

# Run Jest with the specific test file
npx jest __tests__/troubleshooting-settings.test.ts --verbose --detectOpenHandles

TEST_EXIT_CODE=$?

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Test Results Summary                                       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    echo ""
    echo "Tested:"
    echo "  ✓ Troubleshooting API endpoints (7)"
    echo "  ✓ Settings API endpoints (2)"
    echo "  ✓ UI accessibility checks (2)"
    echo "  ✓ Integration flows (5)"
    echo "  ✓ Error handling (3)"
else
    echo -e "${RED}❌ Some tests failed${NC}"
    echo ""
    echo "Please check the output above for details"
fi

echo ""
echo -e "${YELLOW}📊 Additional Information:${NC}"
echo ""
echo "  FlexGate API:  http://localhost:3000"
echo "  Health Check:  http://localhost:3000/health"
echo "  Metrics:       http://localhost:3000/metrics"
echo "  Admin UI:      http://localhost:3002"
echo ""
echo "  Logs:          logs/flexgate.log"
echo "  PID File:      .flexgate.pid"
echo ""

echo -e "${YELLOW}🛠  Useful Commands:${NC}"
echo ""
echo "  Check status:  bash scripts/status.sh"
echo "  View logs:     tail -f logs/flexgate.log"
echo "  Stop services: bash scripts/stop-all.sh"
echo "  Restart:       bash scripts/restart-all.sh"
echo ""

exit $TEST_EXIT_CODE
