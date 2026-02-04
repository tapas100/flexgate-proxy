#!/bin/bash
# Database Setup Script for FlexGate (Native PostgreSQL - No Docker)
# This script installs PostgreSQL via Homebrew and runs migrations

set -e

echo "🚀 FlexGate Database Setup (Native PostgreSQL)"
echo "=============================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Homebrew is installed
if ! command -v brew &> /dev/null; then
    echo -e "${RED}❌ Homebrew is not installed${NC}"
    echo "Please install Homebrew from: https://brew.sh"
    exit 1
fi

echo -e "${GREEN}✓ Homebrew is installed${NC}"

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo -e "${YELLOW}PostgreSQL not found. Installing via Homebrew...${NC}"
    brew install postgresql@16
    echo -e "${GREEN}✓ PostgreSQL installed${NC}"
else
    echo -e "${GREEN}✓ PostgreSQL is already installed${NC}"
fi

# Start PostgreSQL service
echo ""
echo -e "${YELLOW}Starting PostgreSQL service...${NC}"

if brew services list | grep postgresql@16 | grep started > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PostgreSQL is already running${NC}"
else
    brew services start postgresql@16
    echo -e "${GREEN}✓ PostgreSQL service started${NC}"
    echo -e "${YELLOW}Waiting for PostgreSQL to be ready...${NC}"
    sleep 3
fi

# Get current user
CURRENT_USER=$(whoami)

# Create database and user
echo ""
echo -e "${YELLOW}Setting up database and user...${NC}"

# Check if database exists
if psql -U "$CURRENT_USER" -lqt | cut -d \| -f 1 | grep -qw flexgate; then
    echo -e "${GREEN}✓ Database 'flexgate' already exists${NC}"
else
    echo -e "${YELLOW}Creating database 'flexgate'...${NC}"
    createdb -U "$CURRENT_USER" flexgate
    echo -e "${GREEN}✓ Database 'flexgate' created${NC}"
fi

# Check if user exists
if psql -U "$CURRENT_USER" -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='flexgate'" | grep -q 1; then
    echo -e "${GREEN}✓ User 'flexgate' already exists${NC}"
else
    echo -e "${YELLOW}Creating user 'flexgate'...${NC}"
    psql -U "$CURRENT_USER" -d postgres -c "CREATE USER flexgate WITH PASSWORD 'flexgate';"
    echo -e "${GREEN}✓ User 'flexgate' created${NC}"
fi

# Grant privileges
echo -e "${YELLOW}Granting privileges...${NC}"
psql -U "$CURRENT_USER" -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE flexgate TO flexgate;" > /dev/null 2>&1 || true
psql -U "$CURRENT_USER" -d postgres -c "ALTER DATABASE flexgate OWNER TO flexgate;" > /dev/null 2>&1 || true
echo -e "${GREEN}✓ Privileges granted${NC}"

# Create .env file if it doesn't exist
echo ""
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env file from template...${NC}"
    cp .env.example .env
    
    # Generate random JWT secret
    JWT_SECRET=$(openssl rand -base64 32 | tr -d '\n')
    
    # Update .env with generated values for native PostgreSQL
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/your-secret-key-here/${JWT_SECRET}/" .env
        sed -i '' "s/DB_HOST=localhost/DB_HOST=localhost/" .env
        sed -i '' "s/DB_USER=flexgate/DB_USER=$CURRENT_USER/" .env
    else
        # Linux
        sed -i "s/your-secret-key-here/${JWT_SECRET}/" .env
        sed -i "s/DB_HOST=localhost/DB_HOST=localhost/" .env
        sed -i "s/DB_USER=flexgate/DB_USER=$CURRENT_USER/" .env
    fi
    
    echo -e "${GREEN}✓ .env file created with random JWT secret${NC}"
else
    echo -e "${GREEN}✓ .env file already exists${NC}"
fi

echo ""
echo -e "${YELLOW}Running database migrations...${NC}"

# Run migrations
npm run db:migrate

echo ""
echo -e "${YELLOW}Seeding database with sample data...${NC}"

# Seed database
npm run db:seed

echo ""
echo -e "${GREEN}✅ Database setup complete!${NC}"
echo ""
echo "📊 Database Information:"
echo "  Host: localhost"
echo "  Port: 5432"
echo "  Database: flexgate"
echo "  User: $CURRENT_USER (or flexgate)"
echo "  Password: flexgate"
echo ""
echo "🔐 Default Admin Credentials:"
echo "  Email: admin@flexgate.dev"
echo "  Password: admin123"
echo ""
echo "⚠️  Change these credentials in production!"
echo ""
echo "🛠️  Useful Commands:"
echo "  brew services start postgresql@16   - Start PostgreSQL"
echo "  brew services stop postgresql@16    - Stop PostgreSQL"
echo "  brew services restart postgresql@16 - Restart PostgreSQL"
echo "  psql -U $CURRENT_USER -d flexgate   - Connect to database"
echo "  npm run db:migrate                  - Run migrations"
echo "  npm run db:seed                     - Seed sample data"
echo ""
echo "📖 For more information, see DATABASE_SETUP.md"
echo ""
