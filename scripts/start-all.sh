#!/bin/bash

# FlexGate - Start All Services (Development Mode)
# Starts FlexGate and Admin UI directly with Node.js

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

print_header() {
    echo ""
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║                    FlexGate - Start All Services                     ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_status() { echo -e "${CYAN}==>${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

print_header

# Check prerequisites
print_status "Checking prerequisites..."

if ! command_exists node; then
    print_error "Node.js is not installed"
    exit 1
fi
print_success "Node.js $(node --version)"

if ! command_exists npm; then
    print_error "npm is not installed"
    exit 1
fi
print_success "npm $(npm --version)"

# Create logs directory
mkdir -p logs

# Build FlexGate
echo ""
print_status "Building FlexGate..."
if ! npm run build > /dev/null 2>&1; then
    print_error "Failed to build FlexGate"
    exit 1
fi
print_success "FlexGate built"

# Build Admin UI
echo ""
print_status "Building Admin UI..."
print_warning "Skipping Admin UI build (has TypeScript errors - needs fix)"
# cd admin-ui
# if [ ! -d "node_modules" ]; then
#     print_status "Installing Admin UI dependencies..."
#     npm install > /dev/null 2>&1
# fi
#
# if ! npm run build > /dev/null 2>&1; then
#     print_error "Failed to build Admin UI"
#     cd ..
#     exit 1
# fi
# cd ..
# print_success "Admin UI built"

# Stop any existing processes
if [ -f ".flexgate.pid" ]; then
    OLD_PID=$(cat .flexgate.pid)
    if kill -0 $OLD_PID 2>/dev/null; then
        print_status "Stopping existing FlexGate process..."
        kill $OLD_PID 2>/dev/null
        sleep 2
    fi
    rm .flexgate.pid
fi

if [ -f ".admin-ui.pid" ]; then
    OLD_PID=$(cat .admin-ui.pid)
    if kill -0 $OLD_PID 2>/dev/null; then
        print_status "Stopping existing Admin UI process..."
        kill $OLD_PID 2>/dev/null
        sleep 2
    fi
    rm .admin-ui.pid
fi

# Start services
echo ""
print_status "Starting FlexGate API (port 3000)..."
PORT=3000 npm start > logs/flexgate.log 2>&1 &
FLEXGATE_PID=$!
echo $FLEXGATE_PID > .flexgate.pid
print_success "FlexGate started (PID: $FLEXGATE_PID)"

# Wait for FlexGate
sleep 3

# Start Admin UI
print_status "Starting Admin UI (port 3002)..."
print_warning "Skipping Admin UI (build errors - needs TypeScript fix)"
# cd admin-ui
# PORT=3002 npm start > ../logs/admin-ui.log 2>&1 &
# ADMIN_UI_PID=$!
# echo $ADMIN_UI_PID > ../.admin-ui.pid
# cd ..
# print_success "Admin UI started (PID: $ADMIN_UI_PID)"

# Wait for services
echo ""
print_status "Waiting for services to be ready..."
sleep 5

# Verify services
echo ""
print_status "Verifying services..."

if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    print_success "FlexGate API is accessible"
else
    print_warning "FlexGate API not yet ready"
fi

if curl -s http://localhost:3002 > /dev/null 2>&1; then
    print_success "Admin UI is accessible"
else
    print_warning "Admin UI skipped (build errors)"
fi

# Success
echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                    ✅ Services Started! ✅                           ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════════╝${NC}"

echo ""
echo -e "${CYAN}🌐 Access Points:${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  ${GREEN}FlexGate API:${NC}       http://localhost:3000"
echo -e "  ${YELLOW}Admin UI:${NC}           (Temporarily disabled - TypeScript errors)"
echo -e "  ${GREEN}Health Check:${NC}       http://localhost:3000/health"

echo ""
echo -e "${CYAN}📊 Process Info:${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  ${GREEN}FlexGate PID:${NC}       $FLEXGATE_PID"

echo ""
echo -e "${CYAN}📖 Useful Commands:${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  View FlexGate logs:  tail -f logs/flexgate.log"
echo "  Stop all services:   npm run stop:all"
echo "  Check status:        npm run status"
echo "  FlexGate CLI:        node bin/flexgate-cli.js health"

echo ""
echo -e "${GREEN}🚀 FlexGate is ready!${NC}"
echo ""
