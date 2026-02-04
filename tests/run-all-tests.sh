#!/bin/bash

# JetStream Implementation Test Runner
# Runs all tests in the correct order with proper setup

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results tracking
PASSED=0
FAILED=0
SKIPPED=0

echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     FlexGate JetStream Implementation Test Suite      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to print section headers
print_section() {
    echo -e "\n${BLUE}▶ $1${NC}"
    echo -e "${BLUE}$( printf '═%.0s' {1..60} )${NC}"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check if NATS is running
check_nats() {
    if curl -s http://localhost:8222/varz >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Function to start NATS with Podman
start_nats() {
    if check_nats; then
        echo -e "${GREEN}✓${NC} NATS already running"
        return 0
    fi

    echo -e "${YELLOW}→${NC} Starting NATS with Podman..."
    
    if ! command_exists podman; then
        echo -e "${RED}✗${NC} Podman not found. Installing..."
        brew install podman
        podman machine init
        podman machine start
    fi

    # Check if container exists
    if podman ps -a | grep -q flexgate-nats; then
        echo -e "${YELLOW}→${NC} Restarting existing NATS container..."
        podman restart flexgate-nats
    else
        echo -e "${YELLOW}→${NC} Creating new NATS container..."
        podman run -d --name flexgate-nats \
            -p 4222:4222 -p 8222:8222 -p 6222:6222 \
            nats:2.10-alpine --jetstream
    fi

    # Wait for NATS to be ready
    echo -e "${YELLOW}→${NC} Waiting for NATS to be ready..."
    for i in {1..30}; do
        if check_nats; then
            echo -e "${GREEN}✓${NC} NATS is ready"
            return 0
        fi
        sleep 1
    done

    echo -e "${RED}✗${NC} NATS failed to start"
    return 1
}

# Function to run a test file
run_test() {
    local test_file=$1
    local test_name=$2
    local requires_nats=${3:-false}

    echo -e "\n${YELLOW}Testing:${NC} $test_name"
    
    if [ "$requires_nats" = true ] && ! check_nats; then
        echo -e "${RED}✗${NC} NATS not running, skipping test"
        SKIPPED=$((SKIPPED + 1))
        return 1
    fi

    if npm test -- "$test_file" 2>&1 | tee /tmp/test_output.log; then
        echo -e "${GREEN}✓${NC} $test_name passed"
        PASSED=$((PASSED + 1))
        return 0
    else
        echo -e "${RED}✗${NC} $test_name failed"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

# ============================================================================
# Phase 0: Prerequisites Check
# ============================================================================
print_section "Phase 0: Prerequisites Check"

echo -e "${YELLOW}→${NC} Checking Node.js..."
if command_exists node; then
    echo -e "${GREEN}✓${NC} Node.js $(node --version)"
else
    echo -e "${RED}✗${NC} Node.js not found"
    exit 1
fi

echo -e "${YELLOW}→${NC} Checking npm packages..."
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}→${NC} Installing dependencies..."
    npm install
fi

echo -e "${YELLOW}→${NC} Installing test dependencies..."
npm install --save-dev mocha chai sinon nats pg supertest eventsource

# ============================================================================
# Phase 1: Unit Tests (No External Dependencies)
# ============================================================================
print_section "Phase 1: Unit Tests (No External Dependencies)"

echo -e "${YELLOW}→${NC} Running unit tests with mocked dependencies..."

if [ -f "tests/metricsPublisher.test.js" ]; then
    run_test "tests/metricsPublisher.test.js" "MetricsPublisher Service" false
else
    echo -e "${YELLOW}⊘${NC} MetricsPublisher tests not found, skipping"
    SKIPPED=$((SKIPPED + 1))
fi

# ============================================================================
# Phase 2: Integration Tests (Requires NATS)
# ============================================================================
print_section "Phase 2: Integration Tests (Requires NATS)"

# Start NATS
if start_nats; then
    echo ""
    
    # Install NATS client if needed
    if ! npm list nats >/dev/null 2>&1; then
        echo -e "${YELLOW}→${NC} Installing NATS client..."
        npm install nats
    fi
    
    # Run JetStream tests
    if [ -f "tests/jetstream.test.js" ]; then
        run_test "tests/jetstream.test.js" "JetStream Service" true
    else
        echo -e "${YELLOW}⊘${NC} JetStream tests not found, skipping"
        SKIPPED=$((SKIPPED + 1))
    fi
    
    # Run SSE endpoint tests
    if [ -f "tests/sse-endpoint.test.js" ]; then
        run_test "tests/sse-endpoint.test.js" "SSE Endpoint" true
    else
        echo -e "${YELLOW}⊘${NC} SSE endpoint tests not found, skipping"
        SKIPPED=$((SKIPPED + 1))
    fi
else
    echo -e "${RED}✗${NC} Could not start NATS, skipping integration tests"
    SKIPPED=$((SKIPPED + 2))
fi

# ============================================================================
# Phase 3: Frontend Tests
# ============================================================================
print_section "Phase 3: Frontend Tests"

if [ -d "admin-ui" ]; then
    cd admin-ui
    
    echo -e "${YELLOW}→${NC} Installing frontend test dependencies..."
    if ! npm list vitest >/dev/null 2>&1; then
        npm install --save-dev vitest @testing-library/react @testing-library/react-hooks jsdom
    fi
    
    # Create vitest config if it doesn't exist
    if [ ! -f "vitest.config.ts" ]; then
        echo -e "${YELLOW}→${NC} Creating vitest configuration..."
        cat > vitest.config.ts << 'EOF'
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
  },
});
EOF
    fi
    
    if [ -f "src/hooks/useJetStream.test.ts" ]; then
        echo -e "${YELLOW}→${NC} Running frontend hook tests..."
        if npm test 2>&1 | tee /tmp/frontend_test_output.log; then
            echo -e "${GREEN}✓${NC} Frontend tests passed"
            PASSED=$((PASSED + 1))
        else
            echo -e "${RED}✗${NC} Frontend tests failed"
            FAILED=$((FAILED + 1))
        fi
    else
        echo -e "${YELLOW}⊘${NC} Frontend tests not found, skipping"
        SKIPPED=$((SKIPPED + 1))
    fi
    
    cd ..
else
    echo -e "${YELLOW}⊘${NC} admin-ui directory not found, skipping frontend tests"
    SKIPPED=$((SKIPPED + 1))
fi

# ============================================================================
# Phase 4: E2E Tests (Optional)
# ============================================================================
print_section "Phase 4: E2E Tests (Optional)"

if [ -d "flexgate-tests" ]; then
    cd flexgate-tests
    
    echo -e "${YELLOW}→${NC} Running E2E tests with Playwright..."
    if npx playwright test 2>&1 | tee /tmp/e2e_test_output.log; then
        echo -e "${GREEN}✓${NC} E2E tests passed"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}✗${NC} E2E tests failed"
        FAILED=$((FAILED + 1))
    fi
    
    cd ..
else
    echo -e "${YELLOW}⊘${NC} E2E tests not found, skipping"
    SKIPPED=$((SKIPPED + 1))
fi

# ============================================================================
# Test Summary
# ============================================================================
print_section "Test Summary"

TOTAL=$((PASSED + FAILED + SKIPPED))

echo ""
echo -e "Total Tests:    ${BLUE}$TOTAL${NC}"
echo -e "Passed:         ${GREEN}$PASSED${NC}"
echo -e "Failed:         ${RED}$FAILED${NC}"
echo -e "Skipped:        ${YELLOW}$SKIPPED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║           ✓ ALL TESTS PASSED SUCCESSFULLY!            ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${GREEN}🚀 Ready to implement JetStream integration!${NC}"
    echo ""
    exit 0
else
    echo -e "${RED}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║              ✗ SOME TESTS FAILED                       ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${RED}Please review the test output above and fix the issues.${NC}"
    echo ""
    exit 1
fi
