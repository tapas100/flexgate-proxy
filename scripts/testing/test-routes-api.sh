#!/bin/bash
# Quick validation that Routes API is working correctly

echo "🧪 Testing Routes API Endpoints"
echo "================================"
echo ""

BASE_URL="http://localhost:3000/api"

# Test 1: List routes
echo "1️⃣  Testing GET /api/routes..."
RESPONSE=$(curl -s "$BASE_URL/routes")
if echo "$RESPONSE" | grep -q '"success":true'; then
    echo "✅ GET /api/routes - SUCCESS"
    echo "   Found $(echo "$RESPONSE" | grep -o '"id"' | wc -l) routes"
else
    echo "❌ GET /api/routes - FAILED"
    echo "   Response: $RESPONSE"
    exit 1
fi
echo ""

# Test 2: Create route
echo "2️⃣  Testing POST /api/routes..."
CREATE_RESPONSE=$(curl -s -X POST "$BASE_URL/routes" \
    -H "Content-Type: application/json" \
    -d '{"path":"/test-script/*","upstream":"httpbin","methods":["GET","POST"],"enabled":true}')

if echo "$CREATE_RESPONSE" | grep -q '"success":true'; then
    ROUTE_ID=$(echo "$CREATE_RESPONSE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
    echo "✅ POST /api/routes - SUCCESS"
    echo "   Created route: $ROUTE_ID"
else
    echo "❌ POST /api/routes - FAILED"
    echo "   Response: $CREATE_RESPONSE"
    exit 1
fi
echo ""

# Test 3: Get single route
echo "3️⃣  Testing GET /api/routes/:id..."
GET_RESPONSE=$(curl -s "$BASE_URL/routes/$ROUTE_ID")
if echo "$GET_RESPONSE" | grep -q '"success":true'; then
    echo "✅ GET /api/routes/$ROUTE_ID - SUCCESS"
else
    echo "❌ GET /api/routes/:id - FAILED"
    echo "   Response: $GET_RESPONSE"
    exit 1
fi
echo ""

# Test 4: Update route
echo "4️⃣  Testing PUT /api/routes/:id..."
UPDATE_RESPONSE=$(curl -s -X PUT "$BASE_URL/routes/$ROUTE_ID" \
    -H "Content-Type: application/json" \
    -d '{"path":"/test-updated/*","upstream":"httpbin","methods":["GET","POST","PUT"],"enabled":false}')

if echo "$UPDATE_RESPONSE" | grep -q '"success":true'; then
    echo "✅ PUT /api/routes/$ROUTE_ID - SUCCESS"
else
    echo "❌ PUT /api/routes/:id - FAILED"
    echo "   Response: $UPDATE_RESPONSE"
    exit 1
fi
echo ""

# Test 5: Test route connectivity
echo "5️⃣  Testing POST /api/routes/:id/test..."
TEST_RESPONSE=$(curl -s -X POST "$BASE_URL/routes/route-1/test" \
    -H "Content-Type: application/json" \
    -d '{"method":"GET"}')

if echo "$TEST_RESPONSE" | grep -q '"reachable":true'; then
    RESPONSE_TIME=$(echo "$TEST_RESPONSE" | grep -o '"responseTime":[0-9]*' | cut -d':' -f2)
    echo "✅ POST /api/routes/route-1/test - SUCCESS"
    echo "   Upstream reachable, response time: ${RESPONSE_TIME}ms"
else
    echo "❌ POST /api/routes/:id/test - FAILED"
    echo "   Response: $TEST_RESPONSE"
    exit 1
fi
echo ""

# Test 6: Delete route
echo "6️⃣  Testing DELETE /api/routes/:id..."
DELETE_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE_URL/routes/$ROUTE_ID")
if [ "$DELETE_RESPONSE" = "204" ]; then
    echo "✅ DELETE /api/routes/$ROUTE_ID - SUCCESS"
    echo "   HTTP 204 No Content received"
else
    echo "❌ DELETE /api/routes/:id - FAILED"
    echo "   HTTP Status: $DELETE_RESPONSE"
    exit 1
fi
echo ""

echo "================================"
echo "✅ All Routes API tests passed!"
echo "================================"
echo ""
echo "Summary:"
echo "--------"
echo "✅ List routes (GET)"
echo "✅ Create route (POST)"
echo "✅ Get route (GET /:id)"
echo "✅ Update route (PUT /:id)"
echo "✅ Test route (POST /:id/test)"
echo "✅ Delete route (DELETE /:id)"
echo ""
echo "🎉 Routes API is fully functional!"
echo ""
echo "Next steps:"
echo "1. Run E2E tests: cd /Users/tamahant/Documents/GitHub/flexgate-tests && npm test"
echo "2. Check admin UI: open http://localhost:3001/routes"
echo "3. Update API_IMPLEMENTATION_STATUS.md if needed"
