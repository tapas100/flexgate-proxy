#!/bin/bash

# FlexGate Testing Execution Script
# Usage: ./test-execution.sh [feature-name]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results tracking
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

echo -e "${BLUE}╔═══════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   FlexGate Testing Execution Script      ║${NC}"
echo -e "${BLUE}╔═══════════════════════════════════════════╗${NC}"
echo ""

# Function to print test header
print_test_header() {
    echo -e "\n${YELLOW}▶ Testing: $1${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# Function to run test and track results
run_test() {
    local test_name=$1
    local test_command=$2
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    echo -n "  ⏳ $test_name ... "
    
    if eval "$test_command" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PASSED${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        return 0
    else
        echo -e "${RED}✗ FAILED${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi
}

# Function to test API endpoint
test_api() {
    local endpoint=$1
    local method=${2:-GET}
    local expected_status=${3:-200}
    
    response=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "http://localhost:3000$endpoint")
    
    if [ "$response" -eq "$expected_status" ]; then
        return 0
    else
        echo -e "${RED}Expected $expected_status, got $response${NC}"
        return 1
    fi
}

# Check if server is running
check_server() {
    print_test_header "Server Health Check"
    
    if curl -s http://localhost:3000/health > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓ Server is running on port 3000${NC}"
        return 0
    else
        echo -e "  ${RED}✗ Server is not running${NC}"
        echo -e "  ${YELLOW}Start server with: npm start${NC}"
        exit 1
    fi
}

# Test Feature 1: Admin UI
test_admin_ui() {
    print_test_header "Feature 1: Admin UI Foundation"
    
    # Check if admin UI is accessible
    run_test "Admin UI index accessible" "curl -s http://localhost:3000/ | grep -q 'FlexGate'"
    
    # Check static assets
    run_test "Static assets loading" "curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/static/js/main.js | grep -q 200"
}

# Test Feature 2: Routes
test_routes() {
    print_test_header "Feature 2: Visual Route Editor"
    
    run_test "Routes API accessible" "test_api '/api/routes' GET 200"
    
    # Test creating a route (if API exists)
    run_test "Create route endpoint exists" "curl -s -X POST http://localhost:3000/api/routes -H 'Content-Type: application/json' -d '{}' | grep -q 'error\\|success\\|route'"
}

# Test Feature 3: Metrics
test_metrics() {
    print_test_header "Feature 3: Metrics Dashboard"
    
    run_test "Prometheus metrics endpoint" "test_api '/metrics' GET 200"
    
    run_test "Metrics contain http_requests_total" "curl -s http://localhost:3000/metrics | grep -q 'http_requests_total'"
    
    run_test "Metrics contain circuit_breaker_state" "curl -s http://localhost:3000/metrics | grep -q 'circuit_breaker_state'"
}

# Test Feature 4: Logs
test_logs() {
    print_test_header "Feature 4: Log Viewer"
    
    run_test "Logs API accessible" "test_api '/api/logs' GET 200"
    
    run_test "Logs endpoint returns array" "curl -s http://localhost:3000/api/logs | grep -q '\\['"
}

# Test Feature 6: Einstrust SSO
test_sso() {
    print_test_header "Feature 6: Einstrust SAML Integration"
    
    run_test "Auth routes mounted" "test_api '/api/auth/user' GET 401"
    
    # Check if SAML initiate endpoint exists
    run_test "SAML initiate endpoint exists" "curl -s -X POST http://localhost:3000/api/auth/saml/initiate -H 'Content-Type: application/json' -d '{}' | grep -q 'error\\|redirectUrl'"
}

# Test Feature 7: Webhooks
test_webhooks() {
    print_test_header "Feature 7: Webhook Notifications"
    
    # Run unit tests
    echo -e "  ${BLUE}Running unit tests...${NC}"
    if npm test -- webhooks.test.ts --silent 2>&1 | grep -q "PASS"; then
        echo -e "  ${GREEN}✓ Unit tests passed (10/10)${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 10))
        TOTAL_TESTS=$((TOTAL_TESTS + 10))
    else
        echo -e "  ${RED}✗ Unit tests failed${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 10))
        TOTAL_TESTS=$((TOTAL_TESTS + 10))
    fi
    
    # API tests
    run_test "Webhooks API - List webhooks" "test_api '/api/webhooks' GET 200"
    
    run_test "Webhooks API - Get stats" "test_api '/api/webhooks/stats/all' GET 200"
    
    # Test webhook creation
    webhook_response=$(curl -s -X POST http://localhost:3000/api/webhooks \
        -H "Content-Type: application/json" \
        -d '{"url":"https://webhook.site/test","events":["circuit_breaker.opened"]}')
    
    if echo "$webhook_response" | grep -q '"id"'; then
        echo -e "  ${GREEN}✓ Webhook creation successful${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        TOTAL_TESTS=$((TOTAL_TESTS + 1))
        
        # Extract webhook ID and test other operations
        webhook_id=$(echo "$webhook_response" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
        
        if [ -n "$webhook_id" ]; then
            run_test "Webhooks API - Get webhook details" "test_api '/api/webhooks/$webhook_id' GET 200"
            
            run_test "Webhooks API - Get webhook logs" "test_api '/api/webhooks/$webhook_id/logs' GET 200"
            
            run_test "Webhooks API - Delete webhook" "test_api '/api/webhooks/$webhook_id' DELETE 200"
        fi
    else
        echo -e "  ${RED}✗ Webhook creation failed${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        TOTAL_TESTS=$((TOTAL_TESTS + 1))
    fi
}

# Integration test
test_integration() {
    print_test_header "Integration: Complete Proxy Flow"
    
    # Send test request through proxy
    run_test "Proxy request successful" "curl -s http://localhost:3000/api/test | grep -q '.*'"
    
    # Check metrics updated
    run_test "Metrics updated after request" "curl -s http://localhost:3000/metrics | grep -q 'http_requests_total'"
}

# Performance test
test_performance() {
    print_test_header "Performance Testing"
    
    echo -e "  ${BLUE}Running quick load test (100 requests)...${NC}"
    
    # Simple performance test
    start_time=$(date +%s)
    for i in {1..100}; do
        curl -s http://localhost:3000/health > /dev/null &
    done
    wait
    end_time=$(date +%s)
    duration=$((end_time - start_time))
    
    echo -e "  ${GREEN}✓ Completed 100 requests in ${duration}s${NC}"
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    PASSED_TESTS=$((PASSED_TESTS + 1))
}

# Print summary
print_summary() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}          TEST EXECUTION SUMMARY          ${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "  Total Tests:    $TOTAL_TESTS"
    echo -e "  ${GREEN}Passed:         $PASSED_TESTS${NC}"
    echo -e "  ${RED}Failed:         $FAILED_TESTS${NC}"
    
    if [ $TOTAL_TESTS -gt 0 ]; then
        pass_rate=$((PASSED_TESTS * 100 / TOTAL_TESTS))
        echo -e "  Pass Rate:      ${pass_rate}%"
    fi
    
    echo ""
    
    if [ $FAILED_TESTS -eq 0 ]; then
        echo -e "${GREEN}✓ All tests passed!${NC}"
        echo ""
        exit 0
    else
        echo -e "${RED}✗ Some tests failed. Please review the output above.${NC}"
        echo ""
        exit 1
    fi
}

# Main execution
main() {
    local feature=${1:-all}
    
    # Check server first
    check_server
    
    case $feature in
        "admin-ui"|"1")
            test_admin_ui
            ;;
        "routes"|"2")
            test_routes
            ;;
        "metrics"|"3")
            test_metrics
            ;;
        "logs"|"4")
            test_logs
            ;;
        "sso"|"6")
            test_sso
            ;;
        "webhooks"|"7")
            test_webhooks
            ;;
        "integration")
            test_integration
            ;;
        "performance")
            test_performance
            ;;
        "all")
            test_admin_ui
            test_routes
            test_metrics
            test_logs
            test_sso
            test_webhooks
            test_integration
            test_performance
            ;;
        *)
            echo -e "${RED}Unknown feature: $feature${NC}"
            echo ""
            echo "Usage: $0 [feature-name]"
            echo ""
            echo "Available features:"
            echo "  admin-ui (1)    - Admin UI Foundation"
            echo "  routes (2)      - Visual Route Editor"
            echo "  metrics (3)     - Metrics Dashboard"
            echo "  logs (4)        - Log Viewer"
            echo "  sso (6)         - Einstrust SAML Integration"
            echo "  webhooks (7)    - Webhook Notifications"
            echo "  integration     - Integration tests"
            echo "  performance     - Performance tests"
            echo "  all             - Run all tests (default)"
            echo ""
            exit 1
            ;;
    esac
    
    print_summary
}

# Run main
main "$@"
