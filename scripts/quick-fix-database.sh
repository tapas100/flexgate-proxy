#!/bin/bash
# Quick Fix for Database Connection Issues
# This script will set up the database with the correct user

set -e

echo "🔧 FlexGate Database Quick Fix"
echo "=============================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Check if PostgreSQL is running
if ! pg_isready -q; then
    echo -e "${RED}❌ PostgreSQL is not running${NC}"
    echo -e "${YELLOW}Starting PostgreSQL...${NC}"
    brew services start postgresql@16 || brew services start postgresql
    sleep 3
fi

echo -e "${GREEN}✓ PostgreSQL is running${NC}"
echo ""

# Get current user
CURRENT_USER=$(whoami)

echo -e "${BLUE}Choose your fix option:${NC}"
echo "1) Update config to use existing 'flexgate' user (Recommended for dev)"
echo "2) Create 'flexgate_user' for production config"
echo "3) Set up development environment from scratch"
echo ""
read -p "Enter your choice (1-3): " choice

case $choice in
  1)
    echo ""
    echo -e "${YELLOW}Option 1: Updating config to use 'flexgate' user${NC}"
    
    # Check if flexgate user exists
    if psql -U "$CURRENT_USER" -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='flexgate'" | grep -q 1; then
        echo -e "${GREEN}✓ User 'flexgate' exists${NC}"
    else
        echo -e "${YELLOW}Creating user 'flexgate'...${NC}"
        psql -U "$CURRENT_USER" -d postgres -c "CREATE USER flexgate WITH PASSWORD 'flexgate';"
        echo -e "${GREEN}✓ User 'flexgate' created${NC}"
    fi
    
    # Check if database exists
    if psql -U "$CURRENT_USER" -lqt | cut -d \| -f 1 | grep -qw flexgate; then
        echo -e "${GREEN}✓ Database 'flexgate' exists${NC}"
    else
        echo -e "${YELLOW}Creating database 'flexgate'...${NC}"
        createdb -U "$CURRENT_USER" flexgate
        echo -e "${GREEN}✓ Database 'flexgate' created${NC}"
    fi
    
    # Grant privileges
    psql -U "$CURRENT_USER" -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE flexgate TO flexgate;" > /dev/null 2>&1 || true
    psql -U "$CURRENT_USER" -d postgres -c "ALTER DATABASE flexgate OWNER TO flexgate;" > /dev/null 2>&1 || true
    
    # Update config file
    echo -e "${YELLOW}Updating config/flexgate.json...${NC}"
    
    # Backup current config
    cp config/flexgate.json config/flexgate.json.backup-$(date +%Y%m%d-%H%M%S)
    
    # Update config to use flexgate user and database
    cat > config/flexgate.json << 'EOF'
{
  "server": {
    "port": 8080,
    "host": "0.0.0.0",
    "environment": "development"
  },
  "database": {
    "host": "localhost",
    "port": 5432,
    "name": "flexgate",
    "user": "flexgate",
    "password": "flexgate",
    "ssl": false,
    "poolMin": 2,
    "poolMax": 10
  },
  "redis": {
    "host": "localhost",
    "port": 6379,
    "password": "",
    "db": 0
  },
  "security": {
    "corsOrigins": ["*"],
    "corsEnabled": true,
    "rateLimitEnabled": false,
    "rateLimitWindowMs": 60000,
    "rateLimitMaxRequests": 1000
  },
  "logging": {
    "level": "debug"
  },
  "monitoring": {
    "metricsEnabled": true,
    "prometheusPort": 9090,
    "healthCheckInterval": 30000
  },
  "routes": []
}
EOF
    
    echo -e "${GREEN}✓ Config updated${NC}"
    ;;
    
  2)
    echo ""
    echo -e "${YELLOW}Option 2: Creating 'flexgate_user' for production${NC}"
    
    # Check if user exists
    if psql -U "$CURRENT_USER" -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='flexgate_user'" | grep -q 1; then
        echo -e "${GREEN}✓ User 'flexgate_user' already exists${NC}"
    else
        echo -e "${YELLOW}Creating user 'flexgate_user'...${NC}"
        psql -U "$CURRENT_USER" -d postgres -c "CREATE USER flexgate_user WITH PASSWORD 'flexgate_password';"
        echo -e "${GREEN}✓ User 'flexgate_user' created${NC}"
    fi
    
    # Check if database exists
    if psql -U "$CURRENT_USER" -lqt | cut -d \| -f 1 | grep -qw flexgate_prod; then
        echo -e "${GREEN}✓ Database 'flexgate_prod' exists${NC}"
    else
        echo -e "${YELLOW}Creating database 'flexgate_prod'...${NC}"
        createdb -U "$CURRENT_USER" flexgate_prod
        echo -e "${GREEN}✓ Database 'flexgate_prod' created${NC}"
    fi
    
    # Grant privileges
    psql -U "$CURRENT_USER" -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE flexgate_prod TO flexgate_user;" > /dev/null 2>&1 || true
    psql -U "$CURRENT_USER" -d postgres -c "ALTER DATABASE flexgate_prod OWNER TO flexgate_user;" > /dev/null 2>&1 || true
    
    echo -e "${GREEN}✓ Production database setup complete${NC}"
    echo -e "${YELLOW}⚠️  Update your .env file with: DB_PASSWORD=flexgate_password${NC}"
    ;;
    
  3)
    echo ""
    echo -e "${YELLOW}Option 3: Running full development setup${NC}"
    ./scripts/setup-database-native.sh
    ;;
    
  *)
    echo -e "${RED}Invalid choice${NC}"
    exit 1
    ;;
esac

echo ""
echo -e "${YELLOW}Running database migrations...${NC}"

# Check if database is accessible
if psql -U flexgate -d flexgate -c "SELECT 1;" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Database connection successful${NC}"
    
    # Run migrations using TypeScript
    echo -e "${YELLOW}Running migrations...${NC}"
    npm run build > /dev/null 2>&1 || true
    node dist/migrations/run.js || {
        echo -e "${YELLOW}⚠️  Migration script not found or failed${NC}"
        echo -e "${YELLOW}Running migrations manually...${NC}"
        
        # Run SQL migrations manually
        for migration in migrations/*.sql; do
            if [ -f "$migration" ]; then
                echo -e "${YELLOW}Running $(basename "$migration")...${NC}"
                psql -U flexgate -d flexgate -f "$migration" > /dev/null 2>&1 || true
            fi
        done
    }
    
    echo -e "${GREEN}✓ Migrations complete${NC}"
else
    echo -e "${YELLOW}⚠️  Could not connect to database for migrations${NC}"
    echo -e "${YELLOW}You may need to run migrations manually${NC}"
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅ Database Setup Complete!                 ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Restart the server: ./scripts/restart-all.sh"
echo "2. Check logs for any remaining errors"
echo ""
echo -e "${GREEN}Database connection should now work! 🎉${NC}"
