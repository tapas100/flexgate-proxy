#!/bin/bash

# Quick Test Data Generator
# Generates minimal test data for quick testing (5 minutes)
# Usage: ./scripts/testing/quick-test-data.sh

set -e

BASE_URL="${BASE_URL:-http://localhost:8080}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          FlexGate Quick Test Data Generator              ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if server is running
echo -n "Checking server... "
if ! curl -s "$BASE_URL/health" > /dev/null 2>&1; then
  echo -e "${RED}✗${NC}"
  echo -e "${RED}Error: Server is not running at $BASE_URL${NC}"
  echo "Please start the server first: npm start"
  exit 1
fi
echo -e "${GREEN}✓${NC}"
echo ""

# Create test routes
echo -e "${BLUE}📍 Creating Test Routes...${NC}"

routes=(
  '{"path":"/test-route","upstream":"httpbin","methods":["GET","POST"],"enabled":true}'
  '{"path":"/test-slow","upstream":"httpbin","methods":["GET"],"enabled":true,"timeout":10000}'
  '{"path":"/test-limited","upstream":"httpbin","methods":["GET"],"enabled":true}'
)

for i in "${!routes[@]}"; do
  response=$(curl -s -X POST "$BASE_URL/api/routes" \
    -H "Content-Type: application/json" \
    -d "${routes[$i]}" 2>&1 || echo "error")
  
  if [[ "$response" == *"error"* ]] || [[ "$response" == *"exists"* ]]; then
    echo -e "  ${YELLOW}⚠${NC} Route $((i+1)) exists or failed"
  else
    echo -e "  ${GREEN}✓${NC} Route $((i+1)) created"
  fi
done

# Create test API keys
echo ""
echo -e "${BLUE}🔑 Creating Test API Keys...${NC}"

keys=(
  '{"name":"Test Key - Active","keyPrefix":"test_","enabled":true}'
  '{"name":"Test Key - Disabled","keyPrefix":"disabled_","enabled":false}'
  '{"name":"Admin Test Key","keyPrefix":"admin_","enabled":true}'
)

for i in "${!keys[@]}"; do
  response=$(curl -s -X POST "$BASE_URL/api/keys" \
    -H "Content-Type: application/json" \
    -d "${keys[$i]}" 2>&1 || echo "error")
  
  if [[ "$response" == *"error"* ]]; then
    echo -e "  ${YELLOW}⚠${NC} Key $((i+1)) failed"
  else
    echo -e "  ${GREEN}✓${NC} Key $((i+1)) created"
    # Extract and display the API key
    api_key=$(echo "$response" | grep -o '"apiKey":"[^"]*"' | cut -d'"' -f4 2>/dev/null || echo "")
    if [ -n "$api_key" ]; then
      echo -e "    ${YELLOW}Key: $api_key${NC}"
    fi
  fi
done

# Create test webhooks
echo ""
echo -e "${BLUE}🪝 Creating Test Webhooks...${NC}"
echo -e "${YELLOW}Note: Using webhook.site placeholder. Replace with your own URL for real testing.${NC}"

webhooks=(
  '{"name":"Test Webhook - All Events","url":"https://webhook.site/test-all","events":["*"],"enabled":true}'
  '{"name":"Test Webhook - AI Events","url":"https://webhook.site/test-ai","events":["ai_incident.created","ai_incident.resolved"],"enabled":true}'
  '{"name":"Test Webhook - Circuit Breaker","url":"https://webhook.site/test-cb","events":["circuit_breaker.opened","circuit_breaker.closed"],"enabled":true}'
)

for i in "${!webhooks[@]}"; do
  response=$(curl -s -X POST "$BASE_URL/api/webhooks" \
    -H "Content-Type: application/json" \
    -d "${webhooks[$i]}" 2>&1 || echo "error")
  
  if [[ "$response" == *"error"* ]]; then
    echo -e "  ${YELLOW}⚠${NC} Webhook $((i+1)) failed"
  else
    echo -e "  ${GREEN}✓${NC} Webhook $((i+1)) created"
  fi
done

# Create test AI incidents
echo ""
echo -e "${BLUE}🤖 Creating Test AI Incidents...${NC}"

event_types=("LATENCY_ANOMALY" "ERROR_SPIKE" "MEMORY_LEAK" "CPU_SPIKE" "TRAFFIC_SURGE")
severities=("CRITICAL" "WARNING" "INFO")

for i in {1..15}; do
  event_type="${event_types[$((RANDOM % ${#event_types[@]}))]}"
  severity="${severities[$((RANDOM % ${#severities[@]}))]}"
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  
  incident=$(cat <<EOF
{
  "event": {
    "event_id": "evt_quick_test_${i}_$(date +%s)",
    "event_type": "$event_type",
    "severity": "$severity",
    "summary": "Quick test incident $i: $event_type detected",
    "detected_at": "$timestamp",
    "metrics": {
      "value": $((100 + RANDOM % 900)),
      "threshold": 500
    },
    "context": {
      "service": "test-service",
      "test": true
    }
  }
}
EOF
)
  
  response=$(curl -s -X POST "$BASE_URL/api/ai-incidents" \
    -H "Content-Type: application/json" \
    -d "$incident" 2>&1 || echo "error")
  
  if [[ "$response" == *"error"* ]]; then
    echo -e "  ${RED}✗${NC} Incident $i failed"
  else
    echo -e "  ${GREEN}✓${NC} Incident $i created ($event_type - $severity)"
  fi
  
  # Small delay to avoid overwhelming the server
  sleep 0.3
done

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║             Test Data Generation Complete!                ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Summary:${NC}"
echo "  • Routes: 3 created"
echo "  • API Keys: 3 created"
echo "  • Webhooks: 3 created"
echo "  • AI Incidents: 15 created"
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo "  1. View incidents:  flexgate ai incidents"
echo "  2. Test route:      curl $BASE_URL/test-route"
echo "  3. View webhooks:   flexgate webhooks list"
echo "  4. Run tests:       ./scripts/testing/critical-path-test.sh"
echo ""
echo -e "${YELLOW}To clean up test data:${NC}"
echo "  ./scripts/testing/cleanup-test-data.sh"
echo ""
