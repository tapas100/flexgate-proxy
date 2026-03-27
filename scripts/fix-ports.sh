#!/bin/bash
# Port Configuration Fix & Validation Script
# Version: 1.0.0
# Purpose: Ensure all port configurations are correct and prevent future misalignment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔧 FlexGate Port Configuration Validator${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

# Get script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Expected port values
EXPECTED_BACKEND_PORT=8080
EXPECTED_ADMIN_UI_PORT=3000

# Validation results
ISSUES_FOUND=0
FIXES_APPLIED=0

# Function to check and fix a config file
check_and_fix() {
  local file=$1
  local key=$2
  local expected_value=$3
  local description=$4
  
  if [ ! -f "$file" ]; then
    echo -e "${YELLOW}⚠️  File not found: $file${NC}"
    return
  fi
  
  # Read current value
  current_value=$(grep "^${key}=" "$file" | cut -d'=' -f2- | tr -d '\r\n' | xargs)
  
  if [ "$current_value" = "$expected_value" ]; then
    echo -e "${GREEN}✅ $description: $current_value${NC}"
  else
    echo -e "${RED}❌ $description${NC}"
    echo -e "   File: $file"
    echo -e "   Expected: ${key}=${expected_value}"
    echo -e "   Found:    ${key}=${current_value}"
    
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
    
    # Ask for permission to fix
    if [ "${AUTO_FIX:-0}" = "1" ]; then
      fix_config "$file" "$key" "$expected_value"
    else
      read -p "   Fix this? (y/n) " -n 1 -r
      echo
      if [[ $REPLY =~ ^[Yy]$ ]]; then
        fix_config "$file" "$key" "$expected_value"
      fi
    fi
  fi
}

# Function to fix a config value
fix_config() {
  local file=$1
  local key=$2
  local new_value=$3
  
  # Create backup
  cp "$file" "${file}.backup"
  
  # Fix the value (works on both macOS and Linux)
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|^${key}=.*|${key}=${new_value}|" "$file"
  else
    sed -i "s|^${key}=.*|${key}=${new_value}|" "$file"
  fi
  
  echo -e "${GREEN}   ✓ Fixed: ${key}=${new_value}${NC}"
  FIXES_APPLIED=$((FIXES_APPLIED + 1))
}

# 1. Check Backend Port
echo -e "${BLUE}1. Backend API Port Configuration${NC}"
check_and_fix ".env" "PORT" "$EXPECTED_BACKEND_PORT" "Backend API port"
echo ""

# 2. Check Admin UI Port
echo -e "${BLUE}2. Admin UI Port Configuration${NC}"
check_and_fix "admin-ui/.env" "PORT" "$EXPECTED_ADMIN_UI_PORT" "Admin UI dev server port"
echo ""

# 3. Check Admin UI Backend URL
echo -e "${BLUE}3. Admin UI Backend URL Configuration${NC}"
check_and_fix "admin-ui/.env" "REACT_APP_API_URL" "http://localhost:$EXPECTED_BACKEND_PORT" "Admin UI backend URL (.env)"

if [ -f "admin-ui/.env.development.local" ]; then
  check_and_fix "admin-ui/.env.development.local" "REACT_APP_API_URL" "http://localhost:$EXPECTED_BACKEND_PORT" "Admin UI backend URL (.env.development.local)"
fi
echo ""

# 4. Check Admin UI package.json proxy
echo -e "${BLUE}4. Admin UI package.json Proxy Configuration${NC}"

if [ -f "admin-ui/package.json" ]; then
  current_proxy=$(grep '"proxy":' admin-ui/package.json | sed 's/.*"proxy": *"\([^"]*\)".*/\1/' | tr -d '\r\n' | xargs)
  expected_proxy="http://localhost:$EXPECTED_BACKEND_PORT"
  
  if [ "$current_proxy" = "$expected_proxy" ]; then
    echo -e "${GREEN}✅ package.json proxy: $current_proxy${NC}"
  else
    echo -e "${RED}❌ package.json proxy configuration${NC}"
    echo -e "   File: admin-ui/package.json"
    echo -e "   Expected: \"proxy\": \"$expected_proxy\""
    echo -e "   Found:    \"proxy\": \"$current_proxy\""
    
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
    
    if [ "${AUTO_FIX:-0}" = "1" ]; then
      fix_package_json_proxy "$expected_proxy"
    else
      read -p "   Fix this? (y/n) " -n 1 -r
      echo
      if [[ $REPLY =~ ^[Yy]$ ]]; then
        fix_package_json_proxy "$expected_proxy"
      fi
    fi
  fi
fi
echo ""

# Function to fix package.json proxy
fix_package_json_proxy() {
  local new_proxy=$1
  
  # Create backup
  cp admin-ui/package.json admin-ui/package.json.backup
  
  # Fix the proxy value
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|\"proxy\": *\"[^\"]*\"|\"proxy\": \"$new_proxy\"|" admin-ui/package.json
  else
    sed -i "s|\"proxy\": *\"[^\"]*\"|\"proxy\": \"$new_proxy\"|" admin-ui/package.json
  fi
  
  echo -e "${GREEN}   ✓ Fixed: \"proxy\": \"$new_proxy\"${NC}"
  FIXES_APPLIED=$((FIXES_APPLIED + 1))
}

# 5. Test connectivity (if services are running)
echo -e "${BLUE}5. Service Connectivity Test${NC}"

# Check if backend is running
if curl -sf "http://localhost:$EXPECTED_BACKEND_PORT/health" > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Backend API is reachable on port $EXPECTED_BACKEND_PORT${NC}"
  
  # Test specific endpoints
  if curl -sf "http://localhost:$EXPECTED_BACKEND_PORT/api/routes" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ /api/routes endpoint is working${NC}"
  else
    echo -e "${RED}❌ /api/routes endpoint not responding${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
  fi
  
  if curl -sf "http://localhost:$EXPECTED_BACKEND_PORT/api/stream/metrics" -m 2 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ /api/stream/metrics endpoint is working${NC}"
  else
    echo -e "${YELLOW}⚠️  /api/stream/metrics endpoint not responding (SSE stream may require specific headers)${NC}"
  fi
else
  echo -e "${YELLOW}⚠️  Backend API is NOT running on port $EXPECTED_BACKEND_PORT${NC}"
  echo -e "   Start it with: npm start"
fi

# Check if Admin UI is running
if curl -sf "http://localhost:$EXPECTED_ADMIN_UI_PORT" > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Admin UI is reachable on port $EXPECTED_ADMIN_UI_PORT${NC}"
else
  echo -e "${YELLOW}⚠️  Admin UI is NOT running on port $EXPECTED_ADMIN_UI_PORT${NC}"
  echo -e "   Start it with: cd admin-ui && npm start"
fi
echo ""

# 5. Check for hardcoded ports in source code
echo -e "${BLUE}6. Source Code Port Reference Check${NC}"

# Search for hardcoded port references (excluding node_modules, dist, build)
hardcoded_refs=$(grep -r "localhost:3001" admin-ui/src/ 2>/dev/null || true)

if [ -z "$hardcoded_refs" ]; then
  echo -e "${GREEN}✅ No hardcoded port 3001 references found in admin-ui/src/${NC}"
else
  echo -e "${RED}❌ Found hardcoded port references:${NC}"
  echo "$hardcoded_refs"
  ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi
echo ""

# Summary
echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}Summary${NC}"
echo -e "${BLUE}=========================================${NC}"

if [ $ISSUES_FOUND -eq 0 ]; then
  echo -e "${GREEN}✅ All port configurations are correct!${NC}"
else
  echo -e "${YELLOW}⚠️  Found $ISSUES_FOUND issue(s)${NC}"
  
  if [ $FIXES_APPLIED -gt 0 ]; then
    echo -e "${GREEN}✓ Applied $FIXES_APPLIED fix(es)${NC}"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo -e "  1. Restart the Admin UI: cd admin-ui && npm start"
    echo -e "  2. Clear browser cache and reload"
    echo -e "  3. Verify endpoints work: http://localhost:3000"
  fi
fi

echo ""
echo -e "${BLUE}Port Configuration Reference:${NC}"
echo -e "  Backend API:       http://localhost:$EXPECTED_BACKEND_PORT"
echo -e "  Admin UI:          http://localhost:$EXPECTED_ADMIN_UI_PORT"
echo -e "  API Routes:        http://localhost:$EXPECTED_BACKEND_PORT/api/routes"
echo -e "  Metrics Stream:    http://localhost:$EXPECTED_BACKEND_PORT/api/stream/metrics"
echo ""

# Exit code
if [ $ISSUES_FOUND -gt 0 ] && [ $FIXES_APPLIED -eq 0 ]; then
  echo -e "${RED}Run with AUTO_FIX=1 to automatically fix issues:${NC}"
  echo -e "  AUTO_FIX=1 ./scripts/fix-ports.sh"
  exit 1
fi

exit 0
