#!/bin/bash

# Script to trigger actual circuit breaker events by creating a route with an invalid upstream
# This will cause real connection failures that the circuit breaker will detect

echo "🔧 Triggering Circuit Breaker Events"
echo "===================================="
echo ""

# Step 1: Create a route with an invalid upstream that will cause connection failures
echo "Step 1: Creating route with invalid upstream (will cause connection errors)..."

ROUTE_RESPONSE=$(curl -s -X POST http://localhost:3000/api/routes \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/failing-service/*",
    "upstream": "http://invalid-host-that-does-not-exist-12345.com",
    "methods": ["GET", "POST"],
    "stripPath": "/failing-service",
    "description": "Test route for circuit breaker - will fail with connection errors"
  }')

echo "Route creation response: $ROUTE_RESPONSE"
echo ""

# Wait for route to be registered
sleep 2

# Step 2: Make requests that will fail with connection errors
echo "Step 2: Making 7 requests to trigger circuit breaker..."
echo "  → These will fail with ENOTFOUND or connection refused errors"
echo ""

for i in {1..7}; do
  echo "  Request $i/7:"
  curl -s -w "  HTTP Status: %{http_code}\n" \
    http://localhost:3000/failing-service/test \
    -o /dev/null \
    --max-time 5 || echo "  Connection failed (expected)"
  sleep 0.5
done

echo ""
echo "✅ Circuit breaker should now be OPEN"
echo "  → Check webhook deliveries for circuit_breaker.opened event"
echo ""

# Step 3: Wait for half-open state
echo "Step 3: Waiting 65 seconds for circuit breaker to transition to HALF_OPEN..."
for i in {65..1}; do
  if [ $((i % 10)) -eq 0 ]; then
    echo "  ⏳ $i seconds remaining..."
  fi
  sleep 1
done

echo ""
echo "✅ Circuit breaker should now be HALF_OPEN"
echo "  → Check webhook deliveries for circuit_breaker.half_open event"
echo ""

# Step 4: The circuit breaker might try to test requests and fail again, reopening
# Or we need to fix the route to make it succeed

echo "Step 4: Updating route to use valid upstream..."
# Get the route ID first
ROUTE_ID=$(curl -s http://localhost:3000/api/routes | jq -r '.data[] | select(.path == "/failing-service/*") | .id' | head -1)

if [ -n "$ROUTE_ID" ]; then
  curl -s -X PATCH "http://localhost:3000/api/routes/$ROUTE_ID" \
    -H "Content-Type: application/json" \
    -d '{
      "upstream": "https://httpbin.org"
    }' > /dev/null
  
  echo "  ✓ Route updated to use valid upstream"
  echo ""
  
  # Wait a bit for the circuit breaker to transition to half-open if it hasn't
  sleep 5
  
  # Make successful requests to close the circuit
  echo "Step 5: Making 2 successful requests to close circuit breaker..."
  for i in {1..2}; do
    echo "  Request $i/2:"
    curl -s -w "  HTTP Status: %{http_code}\n" \
      http://localhost:3000/failing-service/status/200 \
      -o /dev/null
    sleep 0.5
  done
  
  echo ""
  echo "✅ Circuit breaker should now be CLOSED"
  echo "  → Check webhook deliveries for circuit_breaker.closed event"
  echo ""
  
  # Clean up - delete the test route
  echo "Step 6: Cleaning up test route..."
  curl -s -X DELETE "http://localhost:3000/api/routes/$ROUTE_ID" > /dev/null
  echo "  ✓ Test route deleted"
else
  echo "  ✗ Could not find route ID for cleanup"
fi

echo ""
echo "===================================="
echo "📊 Check Results:"
echo "  1. Go to Admin UI: http://localhost:3001/webhooks"
echo "  2. Click 'View Details' on Circuit Breaker Events webhook"
echo "  3. You should see deliveries with color-coded badges:"
echo "     🔴 circuit_breaker.opened"
echo "     🟡 circuit_breaker.half_open"
echo "     🟢 circuit_breaker.closed"
echo ""
echo "Or check the database:"
echo "  psql -d flexgate -c \"SELECT event_type, status, created_at FROM webhook_deliveries WHERE event_type LIKE 'circuit_breaker.%' ORDER BY created_at DESC LIMIT 10;\""
echo ""
