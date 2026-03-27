#!/bin/bash

# Cleanup Test Data Script
# Removes all test data from the database
# Usage: ./scripts/testing/cleanup-test-data.sh

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          FlexGate Test Data Cleanup                       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Database connection from environment or defaults
DB_USER="${PGUSER:-flexgate}"
DB_NAME="${PGDATABASE:-flexgate_proxy}"
DB_HOST="${PGHOST:-localhost}"
DB_PORT="${PGPORT:-5432}"

# Confirm cleanup
echo -e "${YELLOW}⚠ This will delete ALL test data:${NC}"
echo "  • AI incidents starting with 'evt_test_', 'evt_quick_', 'evt_manual_'"
echo "  • Test webhooks (name starting with 'Test')"
echo "  • Test API keys (name starting with 'Test')"
echo "  • Test routes (path starting with '/test')"
echo "  • Old webhook deliveries (> 7 days)"
echo ""
read -p "Continue? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Cleanup cancelled."
  exit 0
fi

echo ""
echo -e "${BLUE}🧹 Cleaning test data...${NC}"

# Run cleanup SQL
psql -U "$DB_USER" -d "$DB_NAME" -h "$DB_HOST" -p "$DB_PORT" << 'EOF'
-- Start transaction
BEGIN;

-- Clean AI Action Outcomes
DELETE FROM ai_action_outcomes 
WHERE incident_id LIKE 'evt_test_%' 
   OR incident_id LIKE 'evt_quick_%' 
   OR incident_id LIKE 'evt_manual_%';

-- Clean AI Recommendations
DELETE FROM ai_recommendations 
WHERE incident_id LIKE 'evt_test_%' 
   OR incident_id LIKE 'evt_quick_%' 
   OR incident_id LIKE 'evt_manual_%';

-- Clean AI Incidents
DELETE FROM ai_incidents 
WHERE incident_id LIKE 'evt_test_%' 
   OR incident_id LIKE 'evt_quick_%' 
   OR incident_id LIKE 'evt_manual_%';

-- Clean old webhook deliveries (older than 7 days)
DELETE FROM webhook_deliveries 
WHERE created_at < NOW() - INTERVAL '7 days';

-- Clean test webhooks
DELETE FROM webhooks 
WHERE name LIKE 'Test%';

-- Clean test API keys
DELETE FROM api_keys 
WHERE name LIKE 'Test%';

-- Clean test routes
DELETE FROM routes 
WHERE path LIKE '/test%';

-- Commit transaction
COMMIT;

-- Show remaining counts
\echo ''
\echo 'Remaining data:'
SELECT 'AI Incidents:' as table_name, COUNT(*)::text as count FROM ai_incidents
UNION ALL
SELECT 'AI Recommendations:', COUNT(*)::text FROM ai_recommendations
UNION ALL
SELECT 'AI Action Outcomes:', COUNT(*)::text FROM ai_action_outcomes
UNION ALL
SELECT 'Webhooks:', COUNT(*)::text FROM webhooks
UNION ALL
SELECT 'Webhook Deliveries:', COUNT(*)::text FROM webhook_deliveries
UNION ALL
SELECT 'API Keys:', COUNT(*)::text FROM api_keys
UNION ALL
SELECT 'Routes:', COUNT(*)::text FROM routes;
EOF

if [ $? -eq 0 ]; then
  echo ""
  echo -e "${GREEN}✓ Cleanup complete!${NC}"
  echo ""
else
  echo ""
  echo -e "${RED}✗ Cleanup failed${NC}"
  echo "Please check your database connection and try again."
  exit 1
fi
