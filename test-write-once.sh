#!/bin/bash
#
# Test script for write-once API key system
# Tests: save → try update (fail) → delete → save new
#

API_URL="http://localhost:8080/api/settings/ai"

echo "======================================"
echo "FlexGate Write-Once API Key Test"
echo "======================================"
echo ""

# Test 1: Save initial key
echo "Test 1: Save initial API key"
echo "Command: POST /api/settings/ai"
RESPONSE=$(curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{"provider":"gemini","apiKey":"AIza_test_key_initial_12345"}')

echo "Response: $RESPONSE"
SUCCESS=$(echo "$RESPONSE" | jq -r '.success')

if [ "$SUCCESS" = "true" ]; then
  echo "✅ Test 1 PASSED: Initial key saved"
else
  echo "❌ Test 1 FAILED: Could not save initial key"
  exit 1
fi
echo ""

# Test 2: Try to update locked key (should fail)
echo "Test 2: Try to update locked key (should fail)"
echo "Command: POST /api/settings/ai (with different key)"
RESPONSE=$(curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{"provider":"gemini","apiKey":"AIza_test_key_updated_67890"}')

echo "Response: $RESPONSE"
SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
ERROR_CODE=$(echo "$RESPONSE" | jq -r '.code')

if [ "$SUCCESS" = "false" ] && [ "$ERROR_CODE" = "KEY_ALREADY_EXISTS" ]; then
  echo "✅ Test 2 PASSED: Update blocked (write-once protection working)"
else
  echo "❌ Test 2 FAILED: Update should have been blocked"
  exit 1
fi
echo ""

# Test 3: Check status
echo "Test 3: Check API key status"
echo "Command: GET /api/settings/ai"
RESPONSE=$(curl -s "$API_URL")

echo "Response (partial): $(echo "$RESPONSE" | jq '{hasApiKey, apiKeyLocked, apiKey}')"
HAS_KEY=$(echo "$RESPONSE" | jq -r '.hasApiKey')
IS_LOCKED=$(echo "$RESPONSE" | jq -r '.apiKeyLocked')
API_KEY=$(echo "$RESPONSE" | jq -r '.apiKey')

if [ "$HAS_KEY" = "true" ] && [ "$IS_LOCKED" = "true" ] && [ "$API_KEY" = "" ]; then
  echo "✅ Test 3 PASSED: Status correct (hasApiKey=true, locked=true, apiKey='')"
else
  echo "❌ Test 3 FAILED: Status incorrect"
  echo "  hasApiKey: $HAS_KEY (expected: true)"
  echo "  apiKeyLocked: $IS_LOCKED (expected: true)"
  echo "  apiKey: '$API_KEY' (expected: '')"
  exit 1
fi
echo ""

# Test 4: Delete key
echo "Test 4: Delete API key"
echo "Command: DELETE /api/settings/ai/key"
RESPONSE=$(curl -s -X DELETE "$API_URL/key")

echo "Response: $RESPONSE"
SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
HAS_KEY=$(echo "$RESPONSE" | jq -r '.config.hasApiKey')

if [ "$SUCCESS" = "true" ] && [ "$HAS_KEY" = "false" ]; then
  echo "✅ Test 4 PASSED: Key deleted and unlocked"
else
  echo "❌ Test 4 FAILED: Delete failed"
  exit 1
fi
echo ""

# Test 5: Save new key (should work after delete)
echo "Test 5: Save new key (after delete)"
echo "Command: POST /api/settings/ai"
RESPONSE=$(curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{"provider":"openai","apiKey":"sk-proj-test_new_key_abc123"}')

echo "Response: $RESPONSE"
SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
PROVIDER=$(echo "$RESPONSE" | jq -r '.provider')

if [ "$SUCCESS" = "true" ] && [ "$PROVIDER" = "openai" ]; then
  echo "✅ Test 5 PASSED: New key saved successfully"
else
  echo "❌ Test 5 FAILED: Could not save new key after delete"
  exit 1
fi
echo ""

# Test 6: Try to update again (should fail)
echo "Test 6: Try to update new key (should fail)"
echo "Command: POST /api/settings/ai (with different key)"
RESPONSE=$(curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{"provider":"openai","apiKey":"sk-proj-another_key_xyz789"}')

echo "Response: $RESPONSE"
SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
ERROR_CODE=$(echo "$RESPONSE" | jq -r '.code')

if [ "$SUCCESS" = "false" ] && [ "$ERROR_CODE" = "KEY_ALREADY_EXISTS" ]; then
  echo "✅ Test 6 PASSED: Update blocked again (lock re-applied)"
else
  echo "❌ Test 6 FAILED: Second update should have been blocked"
  exit 1
fi
echo ""

# Final cleanup
echo "Test 7: Cleanup (delete test key)"
curl -s -X DELETE "$API_URL/key" > /dev/null
echo "✅ Cleanup complete"
echo ""

# Summary
echo "======================================"
echo "ALL TESTS PASSED! ✅"
echo "======================================"
echo ""
echo "Write-once API key system verified:"
echo "  ✅ Can save initial key"
echo "  ✅ Cannot update locked key"
echo "  ✅ Status shows locked state"
echo "  ✅ Can delete locked key"
echo "  ✅ Can save new key after delete"
echo "  ✅ New key is also locked"
echo ""
echo "System is working correctly!"
