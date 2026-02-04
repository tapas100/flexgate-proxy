#!/usr/bin/env bash
# JetStream Implementation Test Suite
# Tests all components of the real-time metrics streaming

set -e

echo "🧪 JetStream Implementation Test Suite"
echo "======================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

TESTS_PASSED=0
TESTS_FAILED=0

# Test result function
pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((TESTS_PASSED++))
}

fail() {
    echo -e "${RED}✗${NC} $1"
    ((TESTS_FAILED++))
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Test 1: Check Podman Installation
echo "Test 1: Checking Podman installation..."
if command -v podman &> /dev/null; then
    PODMAN_VERSION=$(podman --version)
    pass "Podman is installed ($PODMAN_VERSION)"
else
    fail "Podman is not installed"
    echo "   Install: brew install podman"
fi
echo ""

# Test 2: Check Podman Machine Status
echo "Test 2: Checking Podman machine status..."
if podman machine list | grep -q "Currently running"; then
    pass "Podman machine is running"
else
    warn "Podman machine is not running"
    echo "   Start: podman machine start"
fi
echo ""

# Test 3: Check NATS Container
echo "Test 3: Checking NATS container..."
if podman ps | grep -q "flexgate-nats"; then
    pass "NATS container is running"
    
    # Check ports
    if podman ps | grep "flexgate-nats" | grep -q "4222"; then
        pass "NATS port 4222 is exposed"
    else
        fail "NATS port 4222 is not exposed"
    fi
    
    if podman ps | grep "flexgate-nats" | grep -q "8222"; then
        pass "NATS monitoring port 8222 is exposed"
    else
        warn "NATS monitoring port 8222 is not exposed"
    fi
else
    fail "NATS container is not running"
    echo "   Start: podman run -d --name flexgate-nats -p 4222:4222 -p 8222:8222 nats:2.10-alpine --jetstream"
fi
echo ""

# Test 4: Check NATS Health Endpoint
echo "Test 4: Checking NATS health endpoint..."
if curl -s -f http://localhost:8222/varz > /dev/null 2>&1; then
    pass "NATS health endpoint is accessible"
    
    # Check JetStream is enabled
    if curl -s http://localhost:8222/varz | grep -q "jetstream"; then
        pass "JetStream is enabled"
    else
        fail "JetStream is not enabled"
    fi
else
    fail "NATS health endpoint is not accessible"
fi
echo ""

# Test 5: Check NPM Dependencies
echo "Test 5: Checking NPM dependencies..."
if grep -q '"nats"' package.json; then
    pass "NATS client library is in package.json"
else
    fail "NATS client library is not in package.json"
fi

if grep -q '"uuid"' package.json; then
    pass "UUID library is in package.json"
else
    fail "UUID library is not in package.json"
fi

if [ -d "node_modules/nats" ]; then
    pass "NATS module is installed"
else
    fail "NATS module is not installed"
    echo "   Install: npm install nats uuid --legacy-peer-deps"
fi
echo ""

# Test 6: Check Backend Files
echo "Test 6: Checking backend implementation files..."
if [ -f "src/services/jetstream.js" ]; then
    pass "jetstream.js exists"
    
    # Check key functions
    if grep -q "async connect" src/services/jetstream.js; then
        pass "JetStream connect() method exists"
    fi
    if grep -q "async publishMetrics" src/services/jetstream.js; then
        pass "JetStream publishMetrics() method exists"
    fi
else
    fail "jetstream.js does not exist"
fi

if [ -f "src/services/metricsPublisher.js" ]; then
    pass "metricsPublisher.js exists"
    
    if grep -q "start()" src/services/metricsPublisher.js; then
        pass "MetricsPublisher start() method exists"
    fi
else
    fail "metricsPublisher.js does not exist"
fi

if [ -f "src/routes/stream.js" ]; then
    pass "stream.js (SSE endpoint) exists"
    
    if grep -q "router.get('/metrics'" src/routes/stream.js; then
        pass "SSE /metrics endpoint exists"
    fi
else
    fail "stream.js does not exist"
fi
echo ""

# Test 7: Check Frontend Files
echo "Test 7: Checking frontend implementation files..."
if [ -f "admin-ui/src/hooks/useJetStream.ts" ]; then
    pass "useJetStream.ts hook exists"
    
    if grep -q "EventSource" admin-ui/src/hooks/useJetStream.ts; then
        pass "useJetStream uses EventSource"
    fi
else
    fail "useJetStream.ts does not exist"
fi

if [ -f "admin-ui/src/pages/Dashboard.tsx" ]; then
    if grep -q "useJetStream" admin-ui/src/pages/Dashboard.tsx; then
        pass "Dashboard uses useJetStream hook"
    else
        fail "Dashboard does not use useJetStream hook"
    fi
    
    if grep -q "connected" admin-ui/src/pages/Dashboard.tsx; then
        pass "Dashboard shows connection status"
    fi
else
    fail "Dashboard.tsx does not exist"
fi
echo ""

# Test 8: Check App Integration
echo "Test 8: Checking app.ts integration..."
if [ -f "app.ts" ]; then
    if grep -q "import.*jetStreamService" app.ts; then
        pass "app.ts imports jetStreamService"
    else
        fail "app.ts does not import jetStreamService"
    fi
    
    if grep -q "import.*MetricsPublisher" app.ts; then
        pass "app.ts imports MetricsPublisher"
    else
        fail "app.ts does not import MetricsPublisher"
    fi
    
    if grep -q "streamRoutes" app.ts; then
        pass "app.ts mounts stream routes"
    else
        fail "app.ts does not mount stream routes"
    fi
    
    if grep -q "jetStreamService.connect" app.ts; then
        pass "app.ts initializes JetStream"
    else
        fail "app.ts does not initialize JetStream"
    fi
else
    fail "app.ts does not exist"
fi
echo ""

# Test 9: Check Admin UI Build
echo "Test 9: Checking admin UI build..."
if [ -d "admin-ui/build" ]; then
    pass "Admin UI build directory exists"
    
    if [ -f "admin-ui/build/index.html" ]; then
        pass "Admin UI index.html exists"
    fi
    
    if [ -f "admin-ui/build/static/js/main.*.js" ]; then
        BUILD_SIZE=$(du -sh admin-ui/build/static/js/main.*.js | cut -f1)
        pass "Main JS bundle exists ($BUILD_SIZE)"
    fi
else
    warn "Admin UI is not built"
    echo "   Build: cd admin-ui && npm run build"
fi
echo ""

# Test 10: Check FlexGate Process
echo "Test 10: Checking FlexGate server process..."
if lsof -i :3000 > /dev/null 2>&1; then
    pass "FlexGate server is running on port 3000"
    
    # Test health endpoint
    if curl -s -f http://localhost:3000/health > /dev/null 2>&1; then
        pass "Health endpoint is accessible"
    fi
else
    warn "FlexGate server is not running"
    echo "   Start: npm start"
fi
echo ""

# Test 11: Test SSE Endpoint (if server is running)
echo "Test 11: Testing SSE endpoint..."
if lsof -i :3000 > /dev/null 2>&1; then
    # Test with timeout
    if timeout 5s curl -N -s http://localhost:3000/api/stream/metrics | head -n 1 | grep -q "data:"; then
        pass "SSE endpoint returns data"
    else
        fail "SSE endpoint does not return data"
    fi
    
    # Test stats endpoint
    if curl -s http://localhost:3000/api/stream/stats | grep -q "success"; then
        pass "Stream stats endpoint works"
        
        # Check if connected
        if curl -s http://localhost:3000/api/stream/stats | grep -q '"connected":true'; then
            pass "JetStream is connected"
        else
            fail "JetStream is not connected"
        fi
    else
        fail "Stream stats endpoint does not work"
    fi
else
    warn "Skipping SSE endpoint test (server not running)"
fi
echo ""

# Test 12: Check Database Connection
echo "Test 12: Checking database setup..."
if [ -f ".env" ]; then
    if grep -q "DATABASE_URL" .env || grep -q "DB_HOST" .env; then
        pass "Database configuration exists in .env"
    else
        warn "Database configuration not found in .env"
    fi
else
    warn ".env file not found"
fi
echo ""

# Test 13: Check Logs
echo "Test 13: Checking for recent log entries..."
if [ -f "server.log" ]; then
    if grep -q "JetStream" server.log; then
        pass "JetStream logs found in server.log"
    fi
    
    if grep -q "MetricsPublisher" server.log; then
        pass "MetricsPublisher logs found in server.log"
    fi
    
    # Check for errors
    ERROR_COUNT=$(grep -c "ERROR\|Failed\|Error" server.log 2>/dev/null || echo "0")
    if [ "$ERROR_COUNT" -gt 10 ]; then
        warn "Found $ERROR_COUNT errors in server.log"
    fi
else
    warn "server.log not found"
fi
echo ""

# Summary
echo ""
echo "======================================"
echo "Test Summary"
echo "======================================"
echo -e "${GREEN}Passed:${NC} $TESTS_PASSED"
echo -e "${RED}Failed:${NC} $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 All tests passed!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Open http://localhost:3000 in your browser"
    echo "2. Look for green 'Live' indicator on Dashboard"
    echo "3. Watch metrics update in real-time"
    exit 0
else
    echo -e "${RED}❌ Some tests failed${NC}"
    echo ""
    echo "Common fixes:"
    echo "1. Install Podman: brew install podman"
    echo "2. Start Podman: podman machine init && podman machine start"
    echo "3. Start NATS: See docs/JETSTREAM_QUICKSTART.md"
    echo "4. Install deps: npm install nats uuid --legacy-peer-deps"
    echo "5. Build UI: cd admin-ui && npm run build"
    echo "6. Start server: npm start"
    exit 1
fi
