#!/bin/bash
# Database Setup Script for FlexGate
# This script sets up PostgreSQL and runs migrations

set -e

echo "🚀 FlexGate Database Setup"
echo "=========================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed${NC}"
    echo "Please install Docker from: https://www.docker.com/get-started"
    exit 1
fi

echo -e "${GREEN}✓ Docker is installed${NC}"

# Check if docker-compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ docker-compose is not installed${NC}"
    echo "Please install docker-compose"
    exit 1
fi

echo -e "${GREEN}✓ docker-compose is installed${NC}"
echo ""

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env file from template...${NC}"
    cp .env.example .env
    
    # Generate random JWT secret
    JWT_SECRET=$(openssl rand -base64 32 | tr -d '\n')
    
    # Update .env with generated values
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/your-secret-key-here/${JWT_SECRET}/" .env
    else
        # Linux
        sed -i "s/your-secret-key-here/${JWT_SECRET}/" .env
    fi
    
    echo -e "${GREEN}✓ .env file created with random JWT secret${NC}"
else
    echo -e "${GREEN}✓ .env file already exists${NC}"
fi

echo ""
echo -e "${YELLOW}Starting PostgreSQL with Docker...${NC}"

# Start PostgreSQL container
docker-compose -f docker-compose.dev.yml up -d postgres

echo -e "${GREEN}✓ PostgreSQL container started${NC}"
echo ""

# Wait for PostgreSQL to be ready
echo -e "${YELLOW}Waiting for PostgreSQL to be ready...${NC}"
sleep 3

# Check if PostgreSQL is healthy
for i in {1..30}; do
    if docker exec flexgate-postgres pg_isready -U flexgate > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PostgreSQL is ready${NC}"
        break
    fi
    
    if [ $i -eq 30 ]; then
        echo -e "${RED}❌ PostgreSQL failed to start${NC}"
        docker logs flexgate-postgres
        exit 1
    fi
    
    echo "Waiting... ($i/30)"
    sleep 1
done

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
echo "  User: flexgate"
echo "  Password: flexgate"
echo ""
echo "🔐 Default Admin Credentials:"
echo "  Email: admin@flexgate.dev"
echo "  Password: admin123"
echo ""
echo "⚠️  Change these credentials in production!"
echo ""
echo "🛠️  Useful Commands:"
echo "  npm run db:start    - Start PostgreSQL"
echo "  npm run db:stop     - Stop PostgreSQL"
echo "  npm run db:migrate  - Run migrations"
echo "  npm run db:seed     - Seed sample data"
echo "  npm run db:reset    - Reset database (⚠️  destroys all data)"
echo ""
echo "📖 For more information, see DATABASE_SETUP.md"
echo ""
