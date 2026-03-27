# FlexGate Production Testing Plan 🧪

**Version**: 1.0  
**Date**: February 16, 2026  
**Status**: Ready for Execution  
**Estimated Duration**: 8-12 hours (full test suite)

---

## Table of Contents

1. [Pre-Testing Setup](#1-pre-testing-setup)
2. [Core Proxy Features](#2-core-proxy-features)
3. [Circuit Breaker Testing](#3-circuit-breaker-testing)
4. [Rate Limiter Testing](#4-rate-limiter-testing)
5. [AI Incident Management](#5-ai-incident-management)
6. [Admin UI Testing](#6-admin-ui-testing)
7. [CLI Testing](#7-cli-testing)
8. [Database & Metrics](#8-database--metrics)
9. [Webhooks & Events](#9-webhooks--events)
10. [Security Testing](#10-security-testing)
11. [Performance Testing](#11-performance-testing)
12. [Production Readiness](#12-production-readiness)

---

## 1. Pre-Testing Setup

### 1.1 Environment Preparation

**Objective**: Ensure clean environment with all dependencies running

**Steps**:

```bash
# 1. Navigate to project directory
cd /Users/tamahant/Documents/GitHub/flexgate-proxy

# 2. Clean install dependencies
rm -rf node_modules admin-ui/node_modules
npm install
cd admin-ui && npm install && cd ..

# 3. Clean build
npm run clean
npm run build
cd admin-ui && npm run build && cd ..

# 4. Verify PostgreSQL is running
psql -U postgres -c "SELECT version();"

# 5. Check database exists
psql -U postgres -c "\l" | grep flexgate_proxy

# 6. Verify tables exist
psql -U flexgate -d flexgate_proxy -c "\dt"

# 7. Check Redis (if used for rate limiting)
redis-cli ping  # Should return PONG

# 8. Check NATS (if used for streaming)
curl http://localhost:4222
```

**Expected Results**:
- ✅ All dependencies installed
- ✅ Build successful (no TypeScript errors)
- ✅ PostgreSQL running and accessible
- ✅ Database `flexgate_proxy` exists with all tables
- ✅ Redis responding (or rate limiter configured for local mode)

**Verification**:
```bash
# Quick health check
curl http://localhost:8080/health
# Expected: {"status":"healthy","timestamp":"..."}
```

---

### 1.2 Start All Services

**Objective**: Launch backend, admin UI, and dependencies

**Option 1: Automated Start (Recommended)**

```bash
# Use the automated startup script
./scripts/start-all-with-deps.sh
```

**Option 2: Manual Start**

```bash
# Terminal 1: Backend Server
cd /Users/tamahant/Documents/GitHub/flexgate-proxy
PORT=8080 NODE_ENV=development node dist/bin/www

# Terminal 2: Admin UI
cd /Users/tamahant/Documents/GitHub/flexgate-proxy/admin-ui
PORT=3000 npm start

# Terminal 3: PostgreSQL (if not running)
pg_ctl -D /usr/local/var/postgres start

# Terminal 4: Redis (optional)
redis-server
```

**Verification**:
```bash
# Check backend
curl http://localhost:8080/health

# Check Admin UI
curl http://localhost:3000

# Check processes
ps aux | grep "node.*dist/bin/www"
ps aux | grep "react-scripts"
```

---

### 1.3 Test Data Preparation

**Objective**: Create sample data for testing

```bash
# Create test routes via API
curl -X POST http://localhost:8080/api/routes \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/test-route",
    "upstream": "httpbin",
    "methods": ["GET", "POST"],
    "enabled": true
  }'

# Create test API key
curl -X POST http://localhost:8080/api/keys \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test-key",
    "keyPrefix": "test_",
    "enabled": true
  }'

# Create test webhook
curl -X POST http://localhost:8080/api/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Webhook",
    "url": "https://webhook.site/unique-url",
    "events": ["request.success", "circuit_breaker.opened"],
    "enabled": true
  }'
```

**Expected Results**:
- ✅ Routes created successfully
- ✅ API keys generated
- ✅ Webhooks configured

---

## 2. Core Proxy Features

### 2.1 Basic Request Proxying

**Objective**: Verify proxy forwards requests correctly

**Test Cases**:

#### TC-2.1.1: GET Request Proxying

```bash
# Send GET request through proxy
curl -v http://localhost:8080/httpbin/get

# Expected Response:
# Status: 200
# Headers: Contains correlation-id
# Body: JSON response from httpbin.org
```

**Validation**:
- ✅ Status code: 200
- ✅ Response time: < 2000ms
- ✅ Correlation ID in headers
- ✅ Upstream response forwarded correctly

---

#### TC-2.1.2: POST Request with Body

```bash
# Send POST with JSON body
curl -X POST http://localhost:8080/httpbin/post \
  -H "Content-Type: application/json" \
  -d '{"test": "data", "timestamp": "2026-02-16"}'

# Expected Response:
# Status: 200
# Body contains echoed JSON data
```

**Validation**:
- ✅ Request body forwarded
- ✅ Content-Type preserved
- ✅ Response matches sent data

---

#### TC-2.1.3: Headers Forwarding

```bash
# Send request with custom headers
curl http://localhost:8080/httpbin/headers \
  -H "X-Custom-Header: TestValue" \
  -H "X-Request-ID: test-123"

# Expected Response:
# Body includes custom headers
```

**Validation**:
- ✅ Custom headers forwarded
- ✅ Proxy adds correlation-id
- ✅ Original headers preserved

---

### 2.2 Request Methods Support

**Objective**: Verify all HTTP methods work

```bash
# GET
curl -X GET http://localhost:8080/httpbin/get

# POST
curl -X POST http://localhost:8080/httpbin/post -d "test=data"

# PUT
curl -X PUT http://localhost:8080/httpbin/put -d "test=data"

# PATCH
curl -X PATCH http://localhost:8080/httpbin/patch -d "test=data"

# DELETE
curl -X DELETE http://localhost:8080/httpbin/delete

# OPTIONS
curl -X OPTIONS http://localhost:8080/httpbin/get -v
```

**Validation**:
- ✅ All methods return 200 (or appropriate status)
- ✅ Method-specific responses correct
- ✅ No CORS issues

---

### 2.3 Query Parameters

**Objective**: Verify query strings are preserved

```bash
# Simple query params
curl "http://localhost:8080/httpbin/get?foo=bar&baz=qux"

# Complex query params
curl "http://localhost:8080/httpbin/get?array[]=1&array[]=2&nested[key]=value"

# Special characters
curl "http://localhost:8080/httpbin/get?search=hello%20world&filter=a%3Db"
```

**Validation**:
- ✅ Query params forwarded correctly
- ✅ URL encoding preserved
- ✅ Arrays and nested params work

---

### 2.4 Response Status Codes

**Objective**: Verify proxy handles various status codes

```bash
# Success codes
curl http://localhost:8080/httpbin/status/200
curl http://localhost:8080/httpbin/status/201
curl http://localhost:8080/httpbin/status/204

# Redirect codes
curl -L http://localhost:8080/httpbin/status/301
curl -L http://localhost:8080/httpbin/status/302

# Client error codes
curl http://localhost:8080/httpbin/status/400
curl http://localhost:8080/httpbin/status/404
curl http://localhost:8080/httpbin/status/429

# Server error codes
curl http://localhost:8080/httpbin/status/500
curl http://localhost:8080/httpbin/status/503
```

**Validation**:
- ✅ Status codes preserved
- ✅ Redirects handled correctly
- ✅ Error responses forwarded
- ✅ Metrics recorded for each status

---

## 3. Circuit Breaker Testing

### 3.1 Circuit Breaker State Transitions

**Objective**: Test CLOSED → OPEN → HALF_OPEN → CLOSED cycle

#### TC-3.1.1: Normal Operation (CLOSED State)

**Setup**:
```bash
# Verify circuit breaker is initially CLOSED
curl http://localhost:8080/api/metrics | jq '.circuitBreakers'
```

**Test**:
```bash
# Make successful requests
for i in {1..10}; do
  curl -s http://localhost:8080/httpbin/status/200
  echo "Request $i: Success"
  sleep 0.5
done
```

**Expected Results**:
- ✅ All requests succeed (200 status)
- ✅ Circuit breaker remains CLOSED
- ✅ No rejected requests

**Validation**:
```bash
# Check circuit breaker metrics
curl http://localhost:8080/api/metrics | jq '.circuitBreakers.httpbin'
# Expected: state: "CLOSED", failureRate: 0
```

---

#### TC-3.1.2: Trigger OPEN State

**Objective**: Cause circuit breaker to open due to failures

**Configuration**:
- Failure threshold: 50%
- Volume threshold: 10 requests
- Window: 10 seconds

**Test Script**:
```bash
#!/bin/bash
# Save as: test-circuit-open.sh

echo "Step 1: Triggering circuit breaker to OPEN"
echo "Making 15 failed requests..."

for i in {1..15}; do
  # Request with 2s timeout, but endpoint delays 10s (will timeout)
  curl -m 2 http://localhost:8080/httpbin/delay/10 2>&1 | head -1
  echo "Request $i: Expected timeout"
  sleep 0.2
done

echo ""
echo "Step 2: Verify circuit is OPEN"
curl http://localhost:8080/api/metrics | jq '.circuitBreakers.httpbin'

echo ""
echo "Step 3: Try request (should be rejected immediately)"
time curl http://localhost:8080/httpbin/status/200
```

**Expected Results**:
- ✅ First 10-12 requests timeout (~2s each)
- ✅ Circuit breaker opens after threshold reached
- ✅ Subsequent requests rejected immediately (< 100ms)
- ✅ Event emitted: `circuit_breaker.opened`

**Validation**:
```bash
# Check circuit state
curl http://localhost:8080/api/metrics | jq '.circuitBreakers.httpbin.state'
# Expected: "OPEN"

# Check rejected count
curl http://localhost:8080/api/metrics | jq '.circuitBreakers.httpbin.rejectedCount'
# Expected: > 0

# Verify fast rejection (no upstream call)
time curl http://localhost:8080/httpbin/status/200
# Expected: < 0.2s (instant rejection)
```

---

#### TC-3.1.3: Transition to HALF_OPEN

**Objective**: Verify circuit transitions to HALF_OPEN after timeout

**Configuration**:
- Open duration: 30 seconds (default)

**Test**:
```bash
#!/bin/bash
# After circuit is OPEN

echo "Waiting for circuit breaker timeout (30 seconds)..."
for i in {30..1}; do
  echo -ne "Time remaining: $i seconds\r"
  sleep 1
done

echo ""
echo "Making test request to trigger HALF_OPEN state..."
curl -v http://localhost:8080/httpbin/status/200

echo ""
echo "Checking circuit breaker state..."
curl http://localhost:8080/api/metrics | jq '.circuitBreakers.httpbin'
```

**Expected Results**:
- ✅ After 30s, next request triggers HALF_OPEN transition
- ✅ Limited number of trial requests allowed (default: 3)
- ✅ Event emitted: `circuit_breaker.half_open`

**Validation**:
```bash
# State should be HALF_OPEN
curl http://localhost:8080/api/metrics | jq '.circuitBreakers.httpbin.state'
# Expected: "HALF_OPEN"
```

---

#### TC-3.1.4: Close Circuit with Successful Requests

**Objective**: Verify circuit closes after successful trials

**Test**:
```bash
#!/bin/bash

echo "Making successful requests to close circuit..."

for i in {1..5}; do
  response=$(curl -s -w "%{http_code}" http://localhost:8080/httpbin/status/200)
  echo "Request $i: Status $response"
  sleep 0.5
done

echo ""
echo "Checking circuit breaker state..."
curl http://localhost:8080/api/metrics | jq '.circuitBreakers.httpbin'
```

**Expected Results**:
- ✅ After 2-3 successful requests, circuit closes
- ✅ State transitions: HALF_OPEN → CLOSED
- ✅ Event emitted: `circuit_breaker.closed`
- ✅ Normal operation restored

**Validation**:
```bash
# Final state should be CLOSED
curl http://localhost:8080/api/metrics | jq '.circuitBreakers.httpbin.state'
# Expected: "CLOSED"
```

---

### 3.2 Circuit Breaker Metrics

**Objective**: Verify metrics are recorded correctly

**Test**:
```bash
# Get circuit breaker metrics
curl http://localhost:8080/metrics | grep circuit_breaker

# Expected metrics:
# - circuit_breaker_state{upstream="httpbin"} 0 (CLOSED)
# - circuit_breaker_failures_total{upstream="httpbin"} N
# - circuit_breaker_successes_total{upstream="httpbin"} N
# - circuit_breaker_rejected_total{upstream="httpbin"} N
```

**Validation**:
- ✅ Prometheus metrics exposed
- ✅ Counters increment correctly
- ✅ State gauge reflects current state

---

### 3.3 Circuit Breaker Configuration

**Objective**: Test custom circuit breaker settings

**Test**:
```bash
# Update route with custom circuit breaker config
curl -X PUT http://localhost:8080/api/routes/httpbin-test \
  -H "Content-Type: application/json" \
  -d '{
    "circuitBreaker": {
      "enabled": true,
      "failureThreshold": 30,
      "volumeThreshold": 5,
      "openDuration": 10000,
      "halfOpenRequests": 2
    }
  }'
```

**Validation**:
- ✅ Custom thresholds applied
- ✅ Circuit opens at 30% failure rate
- ✅ Only 5 requests needed for volume
- ✅ Opens for 10s instead of 30s

---

## 4. Rate Limiter Testing

### 4.1 Global Rate Limiting

**Objective**: Verify global rate limits work correctly

**Configuration**:
- Global limit: 100 requests per minute
- Window: 60 seconds

#### TC-4.1.1: Normal Traffic Under Limit

**Test**:
```bash
#!/bin/bash
# Make 50 requests (under limit)

echo "Making 50 requests (under 100/min limit)..."

success=0
failed=0

for i in {1..50}; do
  status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/httpbin/get)
  if [ "$status" = "200" ]; then
    ((success++))
  else
    ((failed++))
    echo "Request $i failed: $status"
  fi
  sleep 0.1
done

echo "Results: Success=$success, Failed=$failed"
```

**Expected Results**:
- ✅ All 50 requests succeed (200)
- ✅ No 429 rate limit errors
- ✅ Rate limit headers present

**Validation**:
```bash
# Check rate limit headers
curl -v http://localhost:8080/httpbin/get 2>&1 | grep -i "ratelimit"
# Expected: 
# X-RateLimit-Limit: 100
# X-RateLimit-Remaining: ~50
# X-RateLimit-Reset: <timestamp>
```

---

#### TC-4.1.2: Exceed Rate Limit

**Test**:
```bash
#!/bin/bash
# Make 110 requests (exceed limit)

echo "Making 110 requests to exceed 100/min limit..."

success=0
rate_limited=0

for i in {1..110}; do
  status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/httpbin/get)
  
  if [ "$status" = "200" ]; then
    ((success++))
  elif [ "$status" = "429" ]; then
    ((rate_limited++))
    echo "Request $i: Rate limited (429)"
  fi
  
  sleep 0.05
done

echo ""
echo "Results:"
echo "  Success: $success"
echo "  Rate Limited: $rate_limited"
echo "  Expected: ~100 success, ~10 rate limited"
```

**Expected Results**:
- ✅ ~100 requests succeed
- ✅ ~10 requests return 429 (Too Many Requests)
- ✅ Event emitted: `rate_limit.exceeded`
- ✅ Metrics recorded

**Validation**:
```bash
# Check rate limit metrics
curl http://localhost:8080/metrics | grep rate_limit
# Expected: rate_limit_rejected_total{route="/httpbin/get"} 10

# Check rate limit event in webhooks
curl http://localhost:8080/api/webhooks/deliveries | jq '.[] | select(.event_type=="rate_limit.exceeded")'
```

---

#### TC-4.1.3: Rate Limit Reset

**Test**:
```bash
#!/bin/bash

echo "Step 1: Hit rate limit"
for i in {1..105}; do
  curl -s -o /dev/null http://localhost:8080/httpbin/get
done

echo ""
echo "Step 2: Wait for window reset (65 seconds)..."
for i in {65..1}; do
  echo -ne "Time remaining: $i seconds\r"
  sleep 1
done

echo ""
echo "Step 3: Test requests after reset"
for i in {1..5}; do
  status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/httpbin/get)
  echo "Request $i: Status $status"
done
```

**Expected Results**:
- ✅ Requests succeed after window reset
- ✅ Rate limit counters reset to 0
- ✅ Event emitted: `rate_limit.recovered`

---

### 4.2 Per-Route Rate Limiting

**Objective**: Test route-specific rate limits

**Setup**:
```bash
# Configure route with custom rate limit
curl -X PUT http://localhost:8080/api/routes/limited-route \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/limited",
    "upstream": "httpbin",
    "rateLimit": {
      "enabled": true,
      "max": 10,
      "windowMs": 60000
    }
  }'
```

**Test**:
```bash
# Make 15 requests to limited route
for i in {1..15}; do
  status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/limited/get)
  echo "Request $i: $status"
  sleep 0.5
done
```

**Expected Results**:
- ✅ First 10 requests succeed (200)
- ✅ Requests 11-15 rate limited (429)
- ✅ Other routes unaffected

---

### 4.3 Rate Limit with Redis Backend

**Objective**: Verify Redis-backed rate limiting (distributed)

**Prerequisites**:
```bash
# Ensure Redis is running
redis-cli ping
# Expected: PONG

# Configure rate limiter to use Redis
# In config.yaml:
# rateLimit:
#   backend: redis
#   redis:
#     url: redis://localhost:6379
```

**Test**:
```bash
# Check Redis keys after requests
redis-cli KEYS "rl:*"

# Make requests
curl http://localhost:8080/httpbin/get

# Check rate limit counter in Redis
redis-cli GET "rl:global:<ip-address>"
```

**Expected Results**:
- ✅ Rate limit state stored in Redis
- ✅ Counters persist across proxy restarts
- ✅ Multiple proxy instances share state

---

## 5. AI Incident Management

### 5.1 AI Incident Creation

**Objective**: Create incidents through various methods

#### TC-5.1.1: Create Incident via AI Testing Page

**Steps**:
1. Navigate to Admin UI: http://localhost:3000/ai-testing
2. Click "Generate Event"
3. Select event type: "LATENCY_ANOMALY"
4. Click "Create Incident"
5. Verify incident created

**Expected Results**:
- ✅ Incident appears in database
- ✅ Incident ID generated (evt_xxx)
- ✅ Status: OPEN
- ✅ Navigate to incident detail page

**Validation**:
```bash
# Check incident in database
psql -U flexgate -d flexgate_proxy -c "SELECT * FROM ai_incidents ORDER BY detected_at DESC LIMIT 1;"

# Check via API
curl http://localhost:8080/api/ai-incidents | jq '.data.incidents[0]'
```

---

#### TC-5.1.2: Create Incident via CLI

**Test**:
```bash
# Create incident with CLI
flexgate ai create \
  --type ERROR_SPIKE \
  --severity CRITICAL \
  --summary "Test error spike incident" \
  --metrics '{"error_rate": 0.15, "total_errors": 250}' \
  --context '{"service": "api-gateway", "endpoint": "/api/users"}'
```

**Expected Results**:
- ✅ Incident created successfully
- ✅ Returns incident ID
- ✅ All fields populated correctly

**Validation**:
```bash
# Get incident details
INCIDENT_ID="<returned-id>"
flexgate ai show $INCIDENT_ID

# Verify in Admin UI
# Navigate to: http://localhost:3000/ai-incidents
```

---

#### TC-5.1.3: Create Incident via API

**Test**:
```bash
curl -X POST http://localhost:8080/api/ai-incidents \
  -H "Content-Type: application/json" \
  -d '{
    "event": {
      "event_id": "evt_test_001",
      "event_type": "MEMORY_LEAK",
      "severity": "WARNING",
      "summary": "Memory usage increasing steadily",
      "detected_at": "2026-02-16T10:00:00Z",
      "metrics": {
        "memory_mb": 2048,
        "memory_growth_rate": 0.05
      },
      "context": {
        "service": "worker-service",
        "pod": "worker-5"
      }
    }
  }'
```

**Expected Results**:
- ✅ Status: 201 Created
- ✅ Returns incident object
- ✅ Incident stored in database

---

### 5.2 AI Recommendations

**Objective**: Test AI recommendation generation and decision tracking

#### TC-5.2.1: Generate Recommendations via AI Testing

**Steps**:
1. Open incident detail page
2. Click "Get AI Recommendations"
3. Wait for Claude API response
4. Verify recommendations displayed

**Expected Results**:
- ✅ Claude prompt generated
- ✅ Recommendations displayed (3-5 options)
- ✅ Each recommendation has:
  - Action type
  - Reasoning
  - Confidence score
  - Priority
  - Risk assessment

**Validation**:
```bash
# Check recommendations in database
psql -U flexgate -d flexgate_proxy -c \
  "SELECT * FROM ai_recommendations WHERE incident_id = 'evt_test_001';"
```

---

#### TC-5.2.2: Add Recommendations via CLI

**Test**:
```bash
flexgate ai recommend evt_test_001 \
  --recommendations '[
    {
      "action_type": "RESTART_SERVICE",
      "reasoning": "Service restart clears memory leaks",
      "confidence": 0.85,
      "priority": 1,
      "estimated_impact": "High memory usage will reset",
      "risk_assessment": "Low risk, standard procedure"
    }
  ]' \
  --prompt "What actions should be taken for memory leak?" \
  --model "claude-3-5-sonnet-20241022"
```

**Expected Results**:
- ✅ Recommendations stored
- ✅ Prompt and model tracked
- ✅ Recommendations ranked by priority

---

#### TC-5.2.3: Record User Decision

**Test**:
```bash
# Get recommendation ID
REC_ID=$(curl -s http://localhost:8080/api/ai-incidents/evt_test_001 | \
  jq -r '.data.recommendations[0].recommendation_id')

# Record ACCEPTED decision
curl -X POST http://localhost:8080/api/ai-incidents/evt_test_001/recommendations/$REC_ID/decision \
  -H "Content-Type: application/json" \
  -d '{
    "decision": "ACCEPTED",
    "reason": "Agreed with AI assessment",
    "actual_action": "RESTART_SERVICE",
    "actual_action_details": "Restarted worker-service via kubectl"
  }'
```

**Expected Results**:
- ✅ Decision recorded
- ✅ Recommendation updated
- ✅ Learning metrics updated

**Test Other Decisions**:
```bash
# REJECTED decision
curl -X POST http://localhost:8080/api/ai-incidents/evt_test_001/recommendations/$REC_ID/decision \
  -d '{"decision": "REJECTED", "reason": "Too risky for production"}'

# MODIFIED decision
curl -X POST http://localhost:8080/api/ai-incidents/evt_test_001/recommendations/$REC_ID/decision \
  -d '{"decision": "MODIFIED", "actual_action": "SCALE_UP", "reason": "Scaled instead of restarting"}'
```

---

### 5.3 Action Outcomes

**Objective**: Track resolution outcomes and measure improvement

#### TC-5.3.1: Record Successful Outcome

**Test**:
```bash
curl -X POST http://localhost:8080/api/ai-incidents/evt_test_001/outcomes \
  -H "Content-Type: application/json" \
  -d '{
    "action_type": "RESTART_SERVICE",
    "outcome_status": "RESOLVED",
    "improvement_percentage": 95,
    "metrics_before": {"memory_mb": 2048, "error_rate": 0.05},
    "metrics_after": {"memory_mb": 512, "error_rate": 0.001},
    "outcome_notes": "Memory usage returned to normal after restart",
    "execution_time_seconds": 45
  }'
```

**Expected Results**:
- ✅ Outcome recorded
- ✅ Incident status updated to RESOLVED
- ✅ Improvement metrics calculated
- ✅ Learning data stored

---

#### TC-5.3.2: Record Failed Outcome

**Test**:
```bash
curl -X POST http://localhost:8080/api/ai-incidents/evt_test_002/outcomes \
  -d '{
    "action_type": "RESTART_SERVICE",
    "outcome_status": "FAILED",
    "improvement_percentage": 0,
    "outcome_notes": "Issue persisted after restart",
    "execution_time_seconds": 30
  }'
```

**Expected Results**:
- ✅ Failed outcome recorded
- ✅ Incident remains OPEN
- ✅ AI learning tracks failure

---

### 5.4 AI Analytics

**Objective**: Verify analytics calculations are correct

#### TC-5.4.1: View Analytics Summary

**Test**:
```bash
# Get 30-day analytics
curl http://localhost:8080/api/ai-incidents/analytics/summary?days=30 | jq '.'
```

**Expected Response**:
```json
{
  "success": true,
  "data": {
    "totalIncidents": 25,
    "openIncidents": 3,
    "resolvedIncidents": 20,
    "falsePositives": 2,
    "acceptanceRate": 0.85,
    "avgResolutionTimeSeconds": 1800,
    "byEventType": [...],
    "bySeverity": [...],
    "resolutionTrend": [...]
  }
}
```

**Validation**:
- ✅ Totals are accurate
- ✅ Percentages calculated correctly
- ✅ Trends show patterns
- ✅ Data matches database queries

---

#### TC-5.4.2: Action Success Rates

**Test**:
```bash
curl http://localhost:8080/api/ai-incidents/analytics/action-success-rates | jq '.'
```

**Expected Data**:
```json
{
  "success": true,
  "data": [
    {
      "action_type": "RESTART_SERVICE",
      "total_attempts": 15,
      "successful": 14,
      "failed": 1,
      "success_rate": 0.933,
      "avg_improvement": 0.87,
      "avg_execution_time": 45
    }
  ]
}
```

**Validation**:
- ✅ Success rates accurate
- ✅ Average improvements calculated
- ✅ Execution times tracked

---

### 5.5 Incident Lifecycle

**Objective**: Test complete incident workflow

**Test Scenario**:
```bash
#!/bin/bash
# Complete incident lifecycle test

echo "=== Step 1: Create Incident ==="
INCIDENT=$(flexgate ai create --type LATENCY_ANOMALY --json | jq -r '.incident_id')
echo "Created: $INCIDENT"

echo ""
echo "=== Step 2: Add Recommendations ==="
flexgate ai recommend $INCIDENT \
  --recommendations '[{"action_type":"RESTART_SERVICE","reasoning":"Test","confidence":0.9,"priority":1}]'

echo ""
echo "=== Step 3: View Incident ==="
flexgate ai show $INCIDENT

echo ""
echo "=== Step 4: Record Decision ==="
REC_ID=$(curl -s http://localhost:8080/api/ai-incidents/$INCIDENT | jq -r '.data.recommendations[0].recommendation_id')
curl -X POST http://localhost:8080/api/ai-incidents/$INCIDENT/recommendations/$REC_ID/decision \
  -d '{"decision":"ACCEPTED","actual_action":"RESTART_SERVICE"}'

echo ""
echo "=== Step 5: Record Outcome ==="
flexgate ai outcome $INCIDENT \
  --action RESTART_SERVICE \
  --status RESOLVED \
  --improvement 90

echo ""
echo "=== Step 6: Update Status ==="
flexgate ai update $INCIDENT --status RESOLVED --rating 5 --feedback "Worked perfectly!"

echo ""
echo "=== Step 7: Verify Resolution ==="
flexgate ai show $INCIDENT
```

**Expected Results**:
- ✅ All steps execute successfully
- ✅ Incident progresses: OPEN → RESOLVED
- ✅ All data tracked correctly
- ✅ Analytics updated

---

## 6. Admin UI Testing

### 6.1 Navigation & Layout

**Objective**: Verify UI navigation works correctly

#### TC-6.1.1: Top Navigation

**Steps**:
1. Open Admin UI: http://localhost:3000
2. Log in (if authentication enabled)
3. Click each top menu item:
   - Dashboard
   - Routes
   - Metrics
   - Logs
   - Webhooks
   - **AI Incidents** (newly added)
   - **AI Analytics** (newly added)

**Expected Results**:
- ✅ All links navigate correctly
- ✅ No 404 errors
- ✅ Active menu item highlighted
- ✅ Page loads without errors

---

#### TC-6.1.2: Bottom Navigation

**Steps**:
1. Scroll to bottom menu items:
   - AI Testing
   - Troubleshooting
   - Settings

**Validation**:
- ✅ All pages accessible
- ✅ AI Incidents/Analytics NOT in bottom menu (moved to top)

---

### 6.2 Dashboard

**Objective**: Test Dashboard features and AI stats integration

#### TC-6.2.1: Main Stats Display

**Steps**:
1. Navigate to Dashboard
2. Verify widgets display:
   - Total Requests
   - Error Rate
   - Avg Latency
   - Active Routes

**Validation**:
- ✅ All widgets load
- ✅ Numbers are realistic
- ✅ No "NaN" or errors
- ✅ Updates on refresh

---

#### TC-6.2.2: AI Incident Tracking Section

**Steps**:
1. Scroll to "AI Incident Tracking (Last 24h)" section
2. Verify 4 stat cards:
   - Total Incidents
   - Resolved Today
   - AI Acceptance Rate
   - Open Incidents

**Test**:
```bash
# Create test incidents to populate stats
for i in {1..5}; do
  flexgate ai create --type LATENCY_ANOMALY
  sleep 1
done
```

**Validation**:
- ✅ Stats update within 60 seconds (auto-refresh)
- ✅ Cards are clickable
- ✅ Clicking navigates to correct pages:
  - Total Incidents → `/ai-incidents`
  - Resolved Today → `/ai-incidents?status=RESOLVED`
  - AI Acceptance Rate → `/ai-analytics`
  - Open Incidents → `/ai-incidents?status=OPEN`
- ✅ Progress bar shows acceptance rate
- ✅ Numbers match API data

---

#### TC-6.2.3: Quick Start Section

**Steps**:
1. Verify Quick Start section mentions AI incidents
2. Click quick action buttons

**Validation**:
- ✅ Updated content includes AI features
- ✅ Links work correctly

---

### 6.3 Metrics Page

**Objective**: Test Metrics page with AI analytics

#### TC-6.3.1: Time Range Selector

**Steps**:
1. Navigate to Metrics page
2. Change time range: 1h → 24h → 7d → 30d
3. Observe metrics update

**Validation**:
- ✅ Metrics update for each time range
- ✅ Charts re-render
- ✅ No loading errors

---

#### TC-6.3.2: AI Analytics Section

**Steps**:
1. Scroll to "AI-Powered Incident Management" section
2. Verify 4 stat cards:
   - AI Incidents (total detected)
   - Auto-Resolved (with success rate)
   - AI Acceptance (with progress bar)
   - Avg Resolution (in minutes)

**Test Time Range Integration**:
```bash
# Change time range and verify stats update
# 1h/24h → 1 day of data
# 7d → 7 days of data
# 30d → 30 days of data
```

**Validation**:
- ✅ Stats change with time range selector
- ✅ "View Full Analytics" button navigates to `/ai-analytics`
- ✅ Numbers update every 60 seconds
- ✅ Loading state displays during fetch

---

### 6.4 AI Incidents Page

**Objective**: Test AI Incidents list and filtering

#### TC-6.4.1: Incident List Display

**Steps**:
1. Navigate to AI Incidents page
2. Verify incident table shows:
   - Incident ID
   - Event Type
   - Severity
   - Summary
   - Status
   - Detected At

**Validation**:
- ✅ Table populated with incidents
- ✅ Pagination works (if > 25 incidents)
- ✅ Sorting works (click column headers)
- ✅ Row click navigates to detail page

---

#### TC-6.4.2: Filtering

**Steps**:
1. Test status filter:
   - All
   - Open
   - Investigating
   - Resolved
   - False Positive
2. Test event type filter
3. Test severity filter
4. Test search by ID

**Validation**:
- ✅ Filters apply correctly
- ✅ Combined filters work (status + severity)
- ✅ Results update immediately
- ✅ No items shown if no matches

---

#### TC-6.4.3: Create New Incident

**Steps**:
1. Click "Create Incident" button
2. Fill form:
   - Event Type
   - Severity
   - Summary
   - Metrics (JSON)
   - Context (JSON)
3. Submit

**Validation**:
- ✅ Form validation works
- ✅ JSON validation for metrics/context
- ✅ Incident created successfully
- ✅ Redirects to incident detail page

---

### 6.5 AI Incident Detail Page

**Objective**: Test incident detail view and actions

#### TC-6.5.1: Incident Information Display

**Steps**:
1. Open incident detail page
2. Verify sections:
   - Incident header (ID, status, severity)
   - Event details
   - Metrics
   - Context
   - Timeline

**Validation**:
- ✅ All fields display correctly
- ✅ JSON data formatted nicely
- ✅ Timestamps formatted properly
- ✅ Severity color-coded

---

#### TC-6.5.2: Get AI Recommendations

**Steps**:
1. Click "Get AI Recommendations" button
2. Wait for Claude API call
3. Verify recommendations display

**Expected Flow**:
1. Loading spinner appears
2. Claude prompt shown
3. Recommendations appear (3-5 options)
4. Each recommendation shows:
   - Action type
   - Reasoning
   - Confidence
   - Priority
   - Risk assessment

**Validation**:
- ✅ Claude API called successfully
- ✅ Recommendations stored in database
- ✅ UI updates without page refresh
- ✅ Error handling if API fails

---

#### TC-6.5.3: Record Decision

**Steps**:
1. Click on a recommendation
2. Select decision: ACCEPTED / REJECTED / MODIFIED
3. Enter reason
4. Submit

**Validation**:
- ✅ Decision modal opens
- ✅ Decision saved to database
- ✅ Recommendation UI updates
- ✅ Analytics updated

---

#### TC-6.5.4: Record Outcome

**Steps**:
1. Click "Record Outcome" button
2. Fill form:
   - Action Type
   - Outcome Status
   - Improvement %
   - Before/After Metrics
   - Notes
3. Submit

**Validation**:
- ✅ Outcome saved
- ✅ Incident status updated
- ✅ Analytics recalculated
- ✅ Timeline updated

---

#### TC-6.5.5: Update Incident

**Steps**:
1. Click "Update Incident" button
2. Change:
   - Status
   - Rating (1-5 stars)
   - Feedback
3. Save

**Validation**:
- ✅ Changes saved
- ✅ UI reflects updates
- ✅ No page reload needed

---

### 6.6 AI Analytics Page

**Objective**: Test analytics visualization

#### TC-6.6.1: Summary Stats

**Steps**:
1. Navigate to AI Analytics page
2. View top summary cards

**Expected Metrics**:
- Total Incidents
- Resolved Rate
- AI Acceptance Rate
- Avg Resolution Time

**Validation**:
- ✅ Numbers accurate (match database)
- ✅ Percentages calculated correctly
- ✅ Trends shown (up/down arrows)

---

#### TC-6.6.2: Charts & Visualizations

**Steps**:
1. Verify charts display:
   - Incidents by Event Type (pie/bar chart)
   - Incidents by Severity
   - Resolution Timeline (line chart)
   - Action Success Rates (bar chart)

**Validation**:
- ✅ Charts render without errors
- ✅ Data matches API responses
- ✅ Interactive (hover tooltips)
- ✅ Legend displayed

---

#### TC-6.6.3: Time Range Filter

**Steps**:
1. Change time range: 7 days, 30 days, 90 days
2. Observe data update

**Validation**:
- ✅ Charts update with new data
- ✅ Summary stats recalculated
- ✅ No loading errors

---

## 7. CLI Testing

### 7.1 CLI Installation & Setup

**Objective**: Verify CLI works globally

**Test**:
```bash
# Install globally (if not already)
npm install -g .

# Verify installation
which flexgate
# Expected: /usr/local/bin/flexgate

# Test help
flexgate --help
flexgate ai --help
```

**Expected Results**:
- ✅ CLI installed globally
- ✅ Help commands work
- ✅ All commands listed

---

### 7.2 AI Incident Commands

**Objective**: Test all 10 CLI commands

#### TC-7.2.1: List Incidents

**Test**:
```bash
# List all incidents
flexgate ai incidents

# Filter by status
flexgate ai incidents --status OPEN

# Filter by severity
flexgate ai incidents --severity CRITICAL

# Filter by type
flexgate ai incidents --type LATENCY_ANOMALY

# Pagination
flexgate ai incidents --limit 10 --offset 20

# JSON output
flexgate ai incidents --json | jq '.incidents | length'
```

**Validation**:
- ✅ Table output formatted correctly
- ✅ Filters work
- ✅ JSON output valid
- ✅ Colors displayed (severity, status)

---

#### TC-7.2.2: Show Incident Detail

**Test**:
```bash
# Get incident ID
INCIDENT_ID=$(flexgate ai incidents --limit 1 --json | jq -r '.incidents[0].incident_id')

# Show detail
flexgate ai show $INCIDENT_ID

# JSON output
flexgate ai show $INCIDENT_ID --json
```

**Validation**:
- ✅ All incident fields displayed
- ✅ Recommendations shown
- ✅ Outcomes shown
- ✅ Timeline displayed

---

#### TC-7.2.3: Create Incident

**Test**:
```bash
# Create with defaults
flexgate ai create

# Create with custom data
flexgate ai create \
  --type ERROR_SPIKE \
  --severity CRITICAL \
  --summary "Production API errors" \
  --metrics '{"error_rate":0.25,"total_errors":500}' \
  --context '{"service":"api-gateway","region":"us-east-1"}'

# JSON output
flexgate ai create --json > new-incident.json
```

**Validation**:
- ✅ Incident created successfully
- ✅ Returns incident ID
- ✅ Custom fields saved correctly

---

#### TC-7.2.4: Update Incident

**Test**:
```bash
# Update status
flexgate ai update $INCIDENT_ID --status INVESTIGATING

# Add rating and feedback
flexgate ai update $INCIDENT_ID --rating 4 --feedback "AI recommendations were helpful"

# Update all at once
flexgate ai update $INCIDENT_ID \
  --status RESOLVED \
  --rating 5 \
  --feedback "Perfect resolution"
```

**Validation**:
- ✅ Updates applied
- ✅ Success message shown
- ✅ Can verify with `show` command

---

#### TC-7.2.5: Add Recommendations

**Test**:
```bash
flexgate ai recommend $INCIDENT_ID \
  --recommendations '[
    {
      "action_type": "SCALE_UP",
      "reasoning": "Increase capacity to handle load",
      "confidence": 0.92,
      "priority": 1,
      "estimated_impact": "Reduce error rate by 80%",
      "risk_assessment": "Low risk"
    }
  ]' \
  --prompt "How to fix error spike?" \
  --model "claude-3-5-sonnet-20241022"
```

**Validation**:
- ✅ Recommendations added
- ✅ Prompt stored
- ✅ Model tracked

---

#### TC-7.2.6: Record Decision

**Test**:
```bash
# Get recommendation ID
REC_ID=$(flexgate ai show $INCIDENT_ID --json | jq -r '.recommendations[0].recommendation_id')

# Record ACCEPTED
flexgate ai decide $INCIDENT_ID $REC_ID \
  --decision ACCEPTED \
  --reason "Matches our analysis" \
  --action SCALE_UP

# Record REJECTED
flexgate ai decide $INCIDENT_ID $REC_ID \
  --decision REJECTED \
  --reason "Too expensive"

# Record MODIFIED
flexgate ai decide $INCIDENT_ID $REC_ID \
  --decision MODIFIED \
  --action RESTART_SERVICE \
  --reason "Simpler solution"
```

**Validation**:
- ✅ Decision recorded
- ✅ All decision types work
- ✅ Optional fields handled

---

#### TC-7.2.7: Record Outcome

**Test**:
```bash
flexgate ai outcome $INCIDENT_ID \
  --action SCALE_UP \
  --status RESOLVED \
  --improvement 85 \
  --notes "Error rate dropped to 0.03"

# Failed outcome
flexgate ai outcome $INCIDENT_ID \
  --action RESTART_SERVICE \
  --status FAILED \
  --notes "Issue persisted"
```

**Validation**:
- ✅ Outcome saved
- ✅ Success and failure tracked
- ✅ Improvement percentage optional

---

#### TC-7.2.8: View Analytics

**Test**:
```bash
# Default (30 days)
flexgate ai analytics

# Custom time range
flexgate ai analytics --days 7
flexgate ai analytics --days 90

# JSON output
flexgate ai analytics --json | jq '.acceptanceRate'
```

**Validation**:
- ✅ Summary stats displayed
- ✅ By event type breakdown
- ✅ By severity breakdown
- ✅ Action success rates shown

---

#### TC-7.2.9: Export Data

**Test**:
```bash
# Export to JSON
flexgate ai export --format json > incidents.json

# Export to CSV
flexgate ai export --format csv > incidents.csv

# Verify files
cat incidents.json | jq '.incidents | length'
head incidents.csv
```

**Validation**:
- ✅ JSON export valid
- ✅ CSV format correct (headers + data)
- ✅ All incidents included

---

#### TC-7.2.10: Watch Mode

**Test**:
```bash
# Start watching (in separate terminal)
flexgate ai watch --interval 30

# In another terminal, create incidents
flexgate ai create --type LATENCY_ANOMALY

# Verify watch mode detects new incident
```

**Validation**:
- ✅ Watch mode runs continuously
- ✅ Detects new incidents
- ✅ Updates displayed
- ✅ Ctrl+C stops watching

---

### 7.3 CLI Error Handling

**Objective**: Verify CLI handles errors gracefully

**Test**:
```bash
# Invalid incident ID
flexgate ai show evt_invalid_id
# Expected: Error message, exit code 1

# Missing required args
flexgate ai decide
# Expected: Help message shown

# Invalid JSON
flexgate ai create --metrics 'invalid-json'
# Expected: JSON parse error

# Network error (server not running)
# Stop server, then:
flexgate ai incidents
# Expected: Connection error message
```

**Validation**:
- ✅ Clear error messages
- ✅ Non-zero exit codes
- ✅ Helpful suggestions shown

---

## 8. Database & Metrics

### 8.1 Database Schema

**Objective**: Verify all tables exist and are properly configured

**Test**:
```bash
# List all tables
psql -U flexgate -d flexgate_proxy -c "\dt"

# Expected tables:
# - ai_incidents
# - ai_recommendations
# - ai_action_outcomes
# - ai_learning_metrics
# - v_ai_incidents_summary (view)
# - routes
# - api_keys
# - webhooks
# - webhook_deliveries
# - stored_metrics
```

**Validation**:
```bash
# Check ai_incidents structure
psql -U flexgate -d flexgate_proxy -c "\d ai_incidents"

# Verify indexes exist
psql -U flexgate -d flexgate_proxy -c "\di"
# Expected: Indexes on incident_id, event_type, status, detected_at
```

---

### 8.2 Metrics Collection

**Objective**: Verify metrics are stored in database

#### TC-8.2.1: Metrics Storage

**Test**:
```bash
# Make some requests
for i in {1..50}; do
  curl -s http://localhost:8080/httpbin/get > /dev/null
done

# Check metrics table
psql -U flexgate -d flexgate_proxy -c \
  "SELECT * FROM stored_metrics ORDER BY timestamp DESC LIMIT 5;"
```

**Expected Results**:
- ✅ Metrics stored in database
- ✅ Timestamps correct
- ✅ Metric values accurate

---

#### TC-8.2.2: Prometheus Metrics Endpoint

**Test**:
```bash
# Get Prometheus metrics
curl http://localhost:8080/metrics

# Expected metrics:
# - http_requests_total
# - http_request_duration_seconds
# - circuit_breaker_state
# - rate_limit_requests_rejected
# - ai_incidents_total
# - ai_recommendations_accepted
```

**Validation**:
- ✅ Metrics in Prometheus format
- ✅ Help text included
- ✅ Type declarations correct
- ✅ Values are numbers (not NaN)

---

### 8.3 Database Performance

**Objective**: Verify database queries perform well

**Test**:
```bash
# Explain query plan for incident list
psql -U flexgate -d flexgate_proxy -c \
  "EXPLAIN ANALYZE SELECT * FROM ai_incidents WHERE status = 'OPEN' ORDER BY detected_at DESC LIMIT 25;"

# Check for index usage
# Expected: "Index Scan using idx_ai_incidents_status"
```

**Validation**:
- ✅ Queries use indexes
- ✅ Query time < 50ms for typical queries
- ✅ No sequential scans on large tables

---

## 9. Webhooks & Events

### 9.1 Webhook Configuration

**Objective**: Set up and test webhooks

#### TC-9.1.1: Create Webhook

**Test**:
```bash
# Get webhook.site URL for testing
# Visit: https://webhook.site
# Copy your unique URL

curl -X POST http://localhost:8080/api/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Webhook",
    "url": "https://webhook.site/your-unique-id",
    "events": [
      "circuit_breaker.opened",
      "rate_limit.exceeded",
      "ai_incident.created"
    ],
    "enabled": true,
    "retry_config": {
      "max_retries": 3,
      "retry_delay": 1000
    }
  }'
```

**Expected Results**:
- ✅ Webhook created
- ✅ Returns webhook ID
- ✅ Stored in database

---

#### TC-9.1.2: Test Webhook Delivery

**Test**:
```bash
# Trigger circuit breaker event
# (Use circuit breaker test from section 3)

# Check webhook.site for delivery

# Verify in database
psql -U flexgate -d flexgate_proxy -c \
  "SELECT * FROM webhook_deliveries ORDER BY created_at DESC LIMIT 5;"
```

**Validation**:
- ✅ Webhook receives event
- ✅ Payload correct format
- ✅ Delivery recorded in database
- ✅ Response code stored

---

#### TC-9.1.3: Webhook Retry Logic

**Test**:
```bash
# Create webhook with invalid URL
curl -X POST http://localhost:8080/api/webhooks \
  -d '{
    "name": "Failing Webhook",
    "url": "http://invalid-domain-12345.com/webhook",
    "events": ["ai_incident.created"],
    "enabled": true
  }'

# Create incident to trigger webhook
flexgate ai create

# Check retry attempts
psql -U flexgate -d flexgate_proxy -c \
  "SELECT webhook_id, attempt, response_code, error FROM webhook_deliveries WHERE webhook_id = 'webhook-id' ORDER BY attempt;"
```

**Expected Results**:
- ✅ Initial delivery fails
- ✅ Retries attempted (up to max_retries)
- ✅ Backoff delay applied
- ✅ Final failure status recorded

---

### 9.2 Event Types

**Objective**: Test all event types trigger correctly

**Event Categories**:

1. **Circuit Breaker Events**:
   - `circuit_breaker.opened`
   - `circuit_breaker.half_open`
   - `circuit_breaker.closed`

2. **Rate Limit Events**:
   - `rate_limit.approaching`
   - `rate_limit.exceeded`
   - `rate_limit.recovered`

3. **Request Events**:
   - `request.success`
   - `request.error`
   - `request.timeout`

4. **AI Incident Events**:
   - `ai_incident.created`
   - `ai_incident.updated`
   - `ai_incident.resolved`

**Test Each Event**:
```bash
# Use existing test scripts
cd scripts/testing

# Test all events
./test-all-events.js

# Verify webhook deliveries
curl http://localhost:8080/api/webhooks/deliveries | jq '.[] | {event_type, status}'
```

---

## 10. Security Testing

### 10.1 Authentication

**Objective**: Verify API key authentication works

**Test**:
```bash
# Request without API key (should be rejected if auth enabled)
curl http://localhost:8080/api/routes
# Expected: 401 Unauthorized (if requireAuth enabled)

# Request with valid API key
curl http://localhost:8080/api/routes \
  -H "X-API-Key: your-api-key"
# Expected: 200 OK

# Request with invalid API key
curl http://localhost:8080/api/routes \
  -H "X-API-Key: invalid-key"
# Expected: 401 Unauthorized
```

---

### 10.2 SSRF Protection

**Objective**: Verify SSRF protection blocks dangerous requests

**Test**:
```bash
# Try to access cloud metadata
curl http://localhost:8080/proxy/169.254.169.254/latest/meta-data
# Expected: 403 Forbidden

# Try to access localhost
curl http://localhost:8080/proxy/127.0.0.1:8080
# Expected: 403 Forbidden

# Try to access private IP
curl http://localhost:8080/proxy/192.168.1.1
# Expected: 403 Forbidden

# Valid external URL should work
curl http://localhost:8080/proxy/httpbin.org/get
# Expected: 200 OK
```

---

### 10.3 Input Validation

**Objective**: Verify malicious input is rejected

**Test**:
```bash
# SQL injection attempt
curl -X POST http://localhost:8080/api/routes \
  -d '{"path": "/test", "upstream": "test; DROP TABLE routes;"}'
# Expected: 400 Bad Request

# XSS attempt
curl http://localhost:8080/api/routes?search=<script>alert(1)</script>
# Expected: Sanitized or rejected

# Path traversal
curl http://localhost:8080/../../../etc/passwd
# Expected: 404 or blocked
```

---

## 11. Performance Testing

### 11.1 Load Testing

**Objective**: Verify proxy handles concurrent requests

**Test**:
```bash
# Install Apache Bench (if not installed)
# brew install apache-bench

# 1000 requests, 100 concurrent
ab -n 1000 -c 100 http://localhost:8080/httpbin/get

# Review results:
# - Requests per second
# - Average response time
# - 95th percentile
# - 99th percentile
```

**Expected Results**:
- ✅ No failed requests
- ✅ RPS > 100
- ✅ P95 < 500ms
- ✅ P99 < 1000ms

---

### 11.2 Memory Usage

**Objective**: Monitor memory consumption

**Test**:
```bash
# Start server and note memory
ps aux | grep "node.*dist/bin/www" | awk '{print $6}'

# Run load test
ab -n 10000 -c 200 http://localhost:8080/httpbin/get

# Check memory after
ps aux | grep "node.*dist/bin/www" | awk '{print $6}'

# Memory growth should be < 50MB
```

---

### 11.3 Database Connection Pooling

**Objective**: Verify database connections are managed

**Test**:
```bash
# Check active database connections
psql -U postgres -c "SELECT count(*) FROM pg_stat_activity WHERE datname = 'flexgate_proxy';"

# Run concurrent requests
ab -n 1000 -c 100 http://localhost:8080/api/ai-incidents

# Check connections again (should not grow unbounded)
```

**Expected Results**:
- ✅ Connection count stable
- ✅ Pool size respected (max 20)
- ✅ No connection leaks

---

## 12. Production Readiness

### 12.1 Health Checks

**Objective**: Verify health endpoints work

**Test**:
```bash
# Liveness probe
curl http://localhost:8080/health
# Expected: {"status":"healthy"}

# Readiness probe
curl http://localhost:8080/ready
# Expected: {"status":"ready","database":"connected"}

# Deep health check
curl http://localhost:8080/health/deep
# Expected: Detailed status of all dependencies
```

---

### 12.2 Graceful Shutdown

**Objective**: Verify server shuts down gracefully

**Test**:
```bash
# Start making requests
while true; do curl http://localhost:8080/httpbin/delay/5; done &
BG_PID=$!

# Send SIGTERM to server
kill -TERM <server-pid>

# Wait for existing requests to complete
wait $BG_PID

# Verify no requests failed mid-flight
```

**Expected Results**:
- ✅ Server waits for active requests
- ✅ No abrupt connection closures
- ✅ Clean shutdown message in logs

---

### 12.3 Logging

**Objective**: Verify structured logging works

**Test**:
```bash
# Make requests and check logs
curl http://localhost:8080/httpbin/get

# Check log file
tail -f logs/flexgate.log

# Verify log structure
cat logs/flexgate.log | jq '.'
```

**Expected Log Format**:
```json
{
  "level": "info",
  "timestamp": "2026-02-16T10:00:00.000Z",
  "correlationId": "abc-123",
  "event": "request.success",
  "http": {
    "method": "GET",
    "path": "/httpbin/get",
    "status": 200,
    "duration": 150
  }
}
```

---

### 12.4 Monitoring Setup

**Objective**: Verify monitoring integration

**Test**:
```bash
# Prometheus scrape
curl http://localhost:8080/metrics

# Grafana dashboard (if configured)
# Visit: http://localhost:3001

# NATS streaming (if configured)
curl http://localhost:8080/api/stream/metrics
```

---

## Test Execution Checklist

### Pre-Production Sign-Off

- [ ] **Section 1**: Environment setup complete
- [ ] **Section 2**: All core proxy features working
- [ ] **Section 3**: Circuit breaker tested (all states)
- [ ] **Section 4**: Rate limiter tested (global + per-route)
- [ ] **Section 5**: AI incidents tested (create, recommend, outcome)
- [ ] **Section 6**: Admin UI tested (all pages, navigation, stats)
- [ ] **Section 7**: CLI tested (all 10 commands)
- [ ] **Section 8**: Database schema verified, metrics collecting
- [ ] **Section 9**: Webhooks delivering, retries working
- [ ] **Section 10**: Security tests passed (auth, SSRF, validation)
- [ ] **Section 11**: Performance acceptable (load, memory, connections)
- [ ] **Section 12**: Production readiness verified (health, shutdown, logs)

### Critical Issues

Document any failing tests here:

| Test Case | Status | Issue | Priority | Notes |
|-----------|--------|-------|----------|-------|
| TC-X.X.X  | ❌ FAIL | Description | HIGH | Action needed |

---

## Test Data Cleanup

After testing, clean up test data:

```bash
# Remove test incidents
psql -U flexgate -d flexgate_proxy -c \
  "DELETE FROM ai_incidents WHERE summary LIKE 'Test%';"

# Remove test webhooks
psql -U flexgate -d flexgate_proxy -c \
  "DELETE FROM webhooks WHERE name LIKE 'Test%';"

# Remove test webhook deliveries
psql -U flexgate -d flexgate_proxy -c \
  "DELETE FROM webhook_deliveries WHERE created_at < NOW() - INTERVAL '1 day';"
```

---

## Appendix: Automation Scripts

### A. Full Test Suite Runner

```bash
#!/bin/bash
# full-test-suite.sh

set -e

echo "=== FlexGate Production Test Suite ==="
echo "Starting at: $(date)"
echo ""

# Section 1: Setup
echo "Section 1: Environment Setup"
./scripts/start-all-with-deps.sh
sleep 5

# Section 2: Core Proxy
echo "Section 2: Core Proxy Features"
for i in {1..10}; do
  curl -s http://localhost:8080/httpbin/get > /dev/null
  echo "  Request $i: OK"
done

# Section 3: Circuit Breaker
echo "Section 3: Circuit Breaker"
./scripts/testing/test-circuit-breaker.js

# Section 4: Rate Limiter
echo "Section 4: Rate Limiter"
./scripts/testing/test-rate-limit.js

# Section 5: AI Incidents
echo "Section 5: AI Incidents"
flexgate ai create --type LATENCY_ANOMALY
flexgate ai incidents

# Continue with remaining sections...

echo ""
echo "=== Test Suite Complete ==="
echo "Finished at: $(date)"
```

---

## Summary

This comprehensive testing plan covers:

- ✅ **12 major sections**
- ✅ **100+ test cases**
- ✅ **All features** (proxy, circuit breaker, rate limiter, AI incidents, UI, CLI)
- ✅ **Detailed steps** for manual execution
- ✅ **Automated scripts** where applicable
- ✅ **Validation criteria** for each test
- ✅ **Production readiness** checklist

**Estimated Duration**: 8-12 hours for complete manual execution  
**Recommended Approach**: Execute sections sequentially, document results  
**Critical Path**: Sections 1-5 are essential for production release

---

**Document Version**: 1.0  
**Last Updated**: February 16, 2026  
**Next Review**: Before production deployment
