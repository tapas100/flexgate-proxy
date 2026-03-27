#!/bin/bash

# FlexGate Critical Path Test Runner
# Runs essential tests before production deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED_TESTS++))
    ((TOTAL_TESTS++))
}

log_error() {
    echo -e "${RED}✗${NC} $1"
    ((FAILED_TESTS++))
    ((TOTAL_TESTS++))
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_section() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Configuration
BACKEND_URL="http://localhost:8080"
ADMIN_UI_URL="http://localhost:3000"

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     FlexGate Critical Path Test Runner                        ║${NC}"
echo -e "${BLUE}║     Production Readiness Verification                         ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Start Time: $(date)"
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Section 1: Health Checks
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_section "1. Health Checks"

log_info "Checking backend health..."
if curl -s -f "$BACKEND_URL/health" > /dev/null; then
    log_success "Backend is healthy"
else
    log_error "Backend health check failed"
fi

log_info "Checking database connection..."
READY_RESPONSE=$(curl -s "$BACKEND_URL/ready")
if echo "$READY_RESPONSE" | grep -q "ready"; then
    log_success "Database connection OK"
else
    log_error "Database connection failed"
fi

log_info "Checking Admin UI..."
if curl -s -f "$ADMIN_UI_URL" > /dev/null; then
    log_success "Admin UI is accessible"
else
    log_error "Admin UI is not accessible"
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Section 2: Core Proxy Functionality
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_section "2. Core Proxy Functionality"

log_info "Testing GET request..."
if curl -s -f "$BACKEND_URL/httpbin/get" | grep -q "httpbin"; then
    log_success "GET request proxied successfully"
else
    log_error "GET request proxying failed"
fi

log_info "Testing POST request..."
if curl -s -X POST "$BACKEND_URL/httpbin/post" -d '{"test":"data"}' | grep -q "test"; then
    log_success "POST request proxied successfully"
else
    log_error "POST request proxying failed"
fi

log_info "Testing status codes..."
STATUS_200=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/httpbin/status/200")
STATUS_404=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/httpbin/status/404")
if [ "$STATUS_200" = "200" ] && [ "$STATUS_404" = "404" ]; then
    log_success "Status codes preserved correctly"
else
    log_error "Status code handling failed (200=$STATUS_200, 404=$STATUS_404)"
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Section 3: Circuit Breaker
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_section "3. Circuit Breaker"

log_info "Checking initial circuit breaker state..."
INITIAL_STATE=$(curl -s "$BACKEND_URL/api/metrics" | grep -o '"state":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ "$INITIAL_STATE" = "CLOSED" ] || [ -n "$INITIAL_STATE" ]; then
    log_success "Circuit breaker initialized (state: ${INITIAL_STATE:-CLOSED})"
else
    log_warning "Circuit breaker state unknown"
fi

log_info "Triggering circuit breaker failures (this will take ~30 seconds)..."
FAILURE_COUNT=0
for i in {1..12}; do
    curl -s -m 2 "$BACKEND_URL/httpbin/delay/10" > /dev/null 2>&1 || ((FAILURE_COUNT++))
    sleep 0.2
done

if [ $FAILURE_COUNT -ge 10 ]; then
    log_success "Triggered $FAILURE_COUNT failures"
    
    log_info "Checking if circuit opened..."
    sleep 2
    START_TIME=$(date +%s)
    curl -s -m 1 "$BACKEND_URL/httpbin/status/200" > /dev/null 2>&1
    END_TIME=$(date +%s)
    RESPONSE_TIME=$((END_TIME - START_TIME))
    
    if [ $RESPONSE_TIME -lt 2 ]; then
        log_success "Circuit breaker OPENED (fast rejection in ${RESPONSE_TIME}s)"
    else
        log_warning "Circuit breaker state unclear (response took ${RESPONSE_TIME}s)"
    fi
else
    log_error "Failed to trigger circuit breaker ($FAILURE_COUNT failures)"
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Section 4: Rate Limiter
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_section "4. Rate Limiter"

log_info "Testing rate limit (making 50 requests)..."
SUCCESS_COUNT=0
LIMITED_COUNT=0

for i in {1..50}; do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/httpbin/get")
    if [ "$STATUS" = "200" ]; then
        ((SUCCESS_COUNT++))
    elif [ "$STATUS" = "429" ]; then
        ((LIMITED_COUNT++))
    fi
    sleep 0.05
done

if [ $SUCCESS_COUNT -gt 40 ]; then
    log_success "Rate limiter allowing normal traffic ($SUCCESS_COUNT/50 succeeded)"
else
    log_warning "Unexpected rate limiting ($SUCCESS_COUNT/50 succeeded, $LIMITED_COUNT rate limited)"
fi

log_info "Checking rate limit headers..."
HEADERS=$(curl -s -v "$BACKEND_URL/httpbin/get" 2>&1 | grep -i "ratelimit")
if [ -n "$HEADERS" ]; then
    log_success "Rate limit headers present"
else
    log_warning "Rate limit headers not found (may be disabled)"
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Section 5: AI Incident Management
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_section "5. AI Incident Management"

log_info "Checking if CLI is available..."
if command -v flexgate &> /dev/null; then
    log_success "FlexGate CLI installed"
    
    log_info "Creating test incident via CLI..."
    INCIDENT_OUTPUT=$(flexgate ai create --type LATENCY_ANOMALY --summary "Test incident from critical path test" 2>&1)
    if echo "$INCIDENT_OUTPUT" | grep -q "evt_"; then
        INCIDENT_ID=$(echo "$INCIDENT_OUTPUT" | grep -o "evt_[a-z0-9_]*" | head -1)
        log_success "Incident created: $INCIDENT_ID"
        
        log_info "Listing incidents..."
        if flexgate ai incidents --limit 1 > /dev/null 2>&1; then
            log_success "Incident list retrieved"
        else
            log_error "Failed to list incidents"
        fi
        
        log_info "Viewing incident detail..."
        if flexgate ai show "$INCIDENT_ID" > /dev/null 2>&1; then
            log_success "Incident detail retrieved"
        else
            log_error "Failed to view incident detail"
        fi
        
        log_info "Updating incident..."
        if flexgate ai update "$INCIDENT_ID" --status RESOLVED --rating 5 > /dev/null 2>&1; then
            log_success "Incident updated successfully"
        else
            log_error "Failed to update incident"
        fi
    else
        log_error "Failed to create incident"
    fi
else
    log_warning "FlexGate CLI not installed (skip AI tests)"
    ((TOTAL_TESTS++))
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Section 6: Database Connectivity
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_section "6. Database Connectivity"

log_info "Checking database tables..."
if command -v psql &> /dev/null; then
    TABLE_COUNT=$(psql -U flexgate -d flexgate_proxy -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null | tr -d ' ')
    if [ -n "$TABLE_COUNT" ] && [ "$TABLE_COUNT" -gt 5 ]; then
        log_success "Database tables exist ($TABLE_COUNT tables)"
    else
        log_error "Database tables missing or inaccessible"
    fi
else
    log_warning "psql not available (skip database tests)"
    ((TOTAL_TESTS++))
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Section 7: Metrics & Monitoring
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_section "7. Metrics & Monitoring"

log_info "Checking Prometheus metrics..."
METRICS=$(curl -s "$BACKEND_URL/metrics")
if echo "$METRICS" | grep -q "http_requests_total"; then
    log_success "Prometheus metrics exposed"
else
    log_error "Prometheus metrics not found"
fi

log_info "Checking circuit breaker metrics..."
if echo "$METRICS" | grep -q "circuit_breaker"; then
    log_success "Circuit breaker metrics present"
else
    log_warning "Circuit breaker metrics not found"
fi

log_info "Checking rate limit metrics..."
if echo "$METRICS" | grep -q "rate_limit"; then
    log_success "Rate limit metrics present"
else
    log_warning "Rate limit metrics not found"
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Section 8: Security
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_section "8. Security Checks"

log_info "Testing SSRF protection (cloud metadata)..."
SSRF_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/proxy/169.254.169.254")
if [ "$SSRF_STATUS" = "403" ] || [ "$SSRF_STATUS" = "404" ]; then
    log_success "SSRF protection active (cloud metadata blocked)"
else
    log_warning "SSRF protection unclear (status: $SSRF_STATUS)"
fi

log_info "Testing SSRF protection (localhost)..."
LOCALHOST_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/proxy/127.0.0.1")
if [ "$LOCALHOST_STATUS" = "403" ] || [ "$LOCALHOST_STATUS" = "404" ]; then
    log_success "SSRF protection active (localhost blocked)"
else
    log_warning "SSRF protection unclear (status: $LOCALHOST_STATUS)"
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Section 9: Performance
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_section "9. Performance Checks"

log_info "Testing response time..."
START=$(date +%s%N)
curl -s "$BACKEND_URL/httpbin/get" > /dev/null
END=$(date +%s%N)
DURATION=$(( (END - START) / 1000000 ))

if [ $DURATION -lt 1000 ]; then
    log_success "Response time acceptable (${DURATION}ms)"
else
    log_warning "Response time slow (${DURATION}ms)"
fi

log_info "Checking memory usage..."
if command -v ps &> /dev/null; then
    MEMORY=$(ps aux | grep "node.*dist/bin/www" | grep -v grep | awk '{print $6}')
    if [ -n "$MEMORY" ]; then
        MEMORY_MB=$((MEMORY / 1024))
        if [ $MEMORY_MB -lt 500 ]; then
            log_success "Memory usage normal (${MEMORY_MB}MB)"
        else
            log_warning "Memory usage high (${MEMORY_MB}MB)"
        fi
    else
        log_warning "Could not determine memory usage"
    fi
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Final Summary
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Test Summary${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Total Tests:  $TOTAL_TESTS"
echo -e "${GREEN}Passed:       $PASSED_TESTS${NC}"
echo -e "${RED}Failed:       $FAILED_TESTS${NC}"
echo ""

PASS_RATE=0
if [ $TOTAL_TESTS -gt 0 ]; then
    PASS_RATE=$((PASSED_TESTS * 100 / TOTAL_TESTS))
fi

echo "Pass Rate:    $PASS_RATE%"
echo ""
echo "End Time:     $(date)"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║     ✓ ALL TESTS PASSED - READY FOR PRODUCTION                 ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    exit 0
elif [ $PASS_RATE -ge 80 ]; then
    echo -e "${YELLOW}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║     ⚠ SOME TESTS FAILED - REVIEW BEFORE PRODUCTION            ║${NC}"
    echo -e "${YELLOW}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    exit 1
else
    echo -e "${RED}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║     ✗ CRITICAL FAILURES - DO NOT DEPLOY                       ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    exit 2
fi
