#!/bin/bash

# FlexGate - Start All Services with Dependencies
# Starts PostgreSQL, Redis, NATS, FlexGate API, and Admin UI

set -e

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
    echo -e "${BLUE}║            FlexGate - Start All Services + Dependencies             ║${NC}"
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

check_port() {
    lsof -ti :$1 >/dev/null 2>&1
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

if ! command_exists brew; then
    print_warning "Homebrew not found - needed for services"
fi

# Create logs directory
mkdir -p logs

echo ""
print_status "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_status "STEP 1: Starting Dependencies"
print_status "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. PostgreSQL
echo ""
print_status "Starting PostgreSQL..."

if ! command_exists psql; then
    print_warning "PostgreSQL not installed"
    read -p "Install PostgreSQL via Homebrew? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        brew install postgresql@16
        brew services start postgresql@16
        sleep 3
        print_success "PostgreSQL installed and started"
    else
        print_warning "Skipping PostgreSQL - database features will not work"
    fi
elif ! pg_isready -q 2>/dev/null; then
    print_status "PostgreSQL not running, starting..."
    brew services start postgresql@16 2>/dev/null || brew services start postgresql 2>/dev/null
    sleep 3
    if pg_isready -q 2>/dev/null; then
        print_success "PostgreSQL started"
    else
        print_warning "Could not start PostgreSQL automatically"
    fi
else
    print_success "PostgreSQL already running"
fi

# Check database setup
if pg_isready -q 2>/dev/null; then
    CURRENT_USER=$(whoami)
    
    # Check if flexgate database exists
    if ! psql -U "$CURRENT_USER" -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw flexgate; then
        print_status "Database 'flexgate' not found, creating..."
        
        # Check if flexgate user exists
        if ! psql -U "$CURRENT_USER" -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='flexgate'" 2>/dev/null | grep -q 1; then
            print_status "Creating user 'flexgate'..."
            psql -U "$CURRENT_USER" -d postgres -c "CREATE USER flexgate WITH PASSWORD 'flexgate';" 2>/dev/null || true
        fi
        
        createdb -U "$CURRENT_USER" flexgate 2>/dev/null || true
        psql -U "$CURRENT_USER" -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE flexgate TO flexgate;" 2>/dev/null || true
        psql -U "$CURRENT_USER" -d postgres -c "ALTER DATABASE flexgate OWNER TO flexgate;" 2>/dev/null || true
        
        print_success "Database 'flexgate' created"
    else
        print_success "Database 'flexgate' ready"
    fi
fi

# 2. Redis (optional)
echo ""
print_status "Starting Redis..."

if ! command_exists redis-server; then
    print_warning "Redis not installed (optional)"
    read -p "Install Redis via Homebrew? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        brew install redis
        brew services start redis
        sleep 2
        print_success "Redis installed and started"
    else
        print_warning "Skipping Redis - will work without it"
    fi
elif ! brew services list 2>/dev/null | grep redis | grep -q started; then
    print_status "Redis not running, starting..."
    brew services start redis
    sleep 2
    print_success "Redis started"
else
    print_success "Redis already running"
fi

# 3. NATS (for JetStream real-time streaming)
echo ""
print_status "Starting NATS Server (for real-time streaming)..."

if ! command_exists nats-server; then
    print_warning "NATS not installed (optional - enables real-time metrics)"
    read -p "Install NATS via Homebrew? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        brew install nats-server
        # Start NATS in background with JetStream enabled
        nohup nats-server -js > logs/nats.log 2>&1 &
        echo $! > .nats.pid
        sleep 2
        print_success "NATS installed and started with JetStream"
    else
        print_warning "Skipping NATS - will use polling fallback for metrics"
    fi
else
    # Check if NATS is running
    if check_port 4222; then
        print_success "NATS already running"
    else
        print_status "Starting NATS with JetStream..."
        nohup nats-server -js > logs/nats.log 2>&1 &
        echo $! > .nats.pid
        sleep 2
        if check_port 4222; then
            print_success "NATS started (PID: $(cat .nats.pid 2>/dev/null || echo 'unknown'))"
        else
            print_warning "NATS may not have started properly"
        fi
    fi
fi

# 4. HAProxy (High-performance proxy)
echo ""
print_status "Starting HAProxy..."

if ! command_exists haproxy; then
    print_warning "HAProxy not installed"
    read -p "Install HAProxy via Homebrew? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        brew install haproxy
        print_success "HAProxy installed"
        
        # Start HAProxy with development config
        if [ -f "haproxy/haproxy.dev.cfg" ]; then
            print_status "Starting HAProxy with development config..."
            nohup haproxy -f haproxy/haproxy.dev.cfg > logs/haproxy.log 2>&1 &
            echo $! > .haproxy.pid
            sleep 2
            
            if check_port 8080; then
                print_success "HAProxy started on port 8080 (PID: $(cat .haproxy.pid))"
                print_success "HAProxy stats: http://localhost:8404/stats (admin/admin)"
            else
                print_warning "HAProxy started but port 8080 not responding yet"
            fi
        else
            print_warning "HAProxy dev config not found at haproxy/haproxy.dev.cfg"
        fi
    else
        print_warning "Skipping HAProxy - direct connections only"
    fi
else
    # Check if HAProxy is running
    if check_port 8080; then
        print_success "HAProxy already running on port 8080"
    else
        if [ -f "haproxy/haproxy.dev.cfg" ]; then
            print_status "Starting HAProxy with development config..."
            nohup haproxy -f haproxy/haproxy.dev.cfg > logs/haproxy.log 2>&1 &
            echo $! > .haproxy.pid
            sleep 2
            
            if check_port 8080; then
                print_success "HAProxy started (PID: $(cat .haproxy.pid 2>/dev/null || echo 'unknown'))"
                print_success "HAProxy stats: http://localhost:8404/stats (admin/admin)"
            else
                print_warning "HAProxy may not have started properly (check logs/haproxy.log)"
            fi
        else
            print_warning "HAProxy dev config not found at haproxy/haproxy.dev.cfg"
        fi
    fi
fi

# 5. Prometheus (Metrics collection)
echo ""
print_status "Starting Prometheus..."

if ! command_exists prometheus; then
    print_warning "Prometheus not installed (optional - enables metrics collection)"
    read -p "Install Prometheus via Homebrew? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        brew install prometheus
        print_success "Prometheus installed"
        
        # Start Prometheus with development config
        if [ -f "infra/prometheus/prometheus.dev.yml" ]; then
            print_status "Starting Prometheus with development config..."
            nohup prometheus --config.file=infra/prometheus/prometheus.dev.yml --storage.tsdb.path=./logs/prometheus > logs/prometheus.log 2>&1 &
            echo $! > .prometheus.pid
            sleep 2
            
            if check_port 9090; then
                print_success "Prometheus started on port 9090 (PID: $(cat .prometheus.pid))"
            else
                print_warning "Prometheus started but port 9090 not responding yet"
            fi
        else
            print_warning "Prometheus dev config not found at infra/prometheus/prometheus.dev.yml"
        fi
    else
        print_warning "Skipping Prometheus - metrics won't be collected"
    fi
else
    # Check if Prometheus is running
    if check_port 9090; then
        print_success "Prometheus already running on port 9090"
    else
        if [ -f "infra/prometheus/prometheus.dev.yml" ]; then
            print_status "Starting Prometheus with development config..."
            nohup prometheus --config.file=infra/prometheus/prometheus.dev.yml --storage.tsdb.path=./logs/prometheus > logs/prometheus.log 2>&1 &
            echo $! > .prometheus.pid
            sleep 2
            
            if check_port 9090; then
                print_success "Prometheus started (PID: $(cat .prometheus.pid 2>/dev/null || echo 'unknown'))"
            else
                print_warning "Prometheus may not have started properly (check logs/prometheus.log)"
            fi
        else
            print_warning "Prometheus dev config not found at infra/prometheus/prometheus.dev.yml"
        fi
    fi
fi

echo ""
print_status "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_status "STEP 2: Updating Configuration"
print_status "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Update config to use local services
echo ""
print_status "Checking FlexGate configuration..."

if grep -q "flexgate_user" config/flexgate.json 2>/dev/null; then
    print_warning "Config still uses 'flexgate_user' (should be 'flexgate')"
    print_status "Run: ./scripts/quick-fix-database.sh to fix this"
else
    print_success "Configuration looks good"
fi

echo ""
print_status "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_status "STEP 3: Building Applications"
print_status "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Build FlexGate
echo ""
print_status "Building FlexGate API..."
if npm run build > logs/build.log 2>&1; then
    print_success "FlexGate API built"
else
    print_error "Failed to build FlexGate API (check logs/build.log)"
    exit 1
fi

# Build Admin UI
echo ""
print_status "Checking Admin UI..."
if [ -d "admin-ui/node_modules" ]; then
    print_success "Admin UI dependencies installed"
else
    print_status "Installing Admin UI dependencies..."
    cd admin-ui
    npm install > ../logs/admin-ui-install.log 2>&1
    cd ..
    print_success "Admin UI dependencies installed"
fi

echo ""
print_status "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_status "STEP 4: Starting FlexGate Services"
print_status "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Stop any existing processes
if [ -f ".flexgate.pid" ]; then
    OLD_PID=$(cat .flexgate.pid)
    if ps -p $OLD_PID > /dev/null 2>&1; then
        print_status "Stopping existing FlexGate process (PID: $OLD_PID)..."
        kill $OLD_PID 2>/dev/null || true
        sleep 2
        # Force kill if still running
        if ps -p $OLD_PID > /dev/null 2>&1; then
            kill -9 $OLD_PID 2>/dev/null || true
        fi
    fi
    rm -f .flexgate.pid
fi

if [ -f ".admin-ui.pid" ]; then
    OLD_PID=$(cat .admin-ui.pid)
    if ps -p $OLD_PID > /dev/null 2>&1; then
        print_status "Stopping existing Admin UI process (PID: $OLD_PID)..."
        kill $OLD_PID 2>/dev/null || true
        sleep 2
        # Force kill if still running
        if ps -p $OLD_PID > /dev/null 2>&1; then
            kill -9 $OLD_PID 2>/dev/null || true
        fi
    fi
    rm -f .admin-ui.pid
fi

# Start FlexGate API
echo ""
print_status "Starting FlexGate API (port 3000)..."
PORT=3000 npm start > logs/flexgate.log 2>&1 &
FLEXGATE_PID=$!
echo $FLEXGATE_PID > .flexgate.pid
print_success "FlexGate API started (PID: $FLEXGATE_PID)"

# Wait for FlexGate to be ready
sleep 3

# Start Admin UI
echo ""
print_status "Starting Admin UI (port 3001)..."
cd admin-ui
PORT=3001 npm start > ../logs/admin-ui.log 2>&1 &
ADMIN_UI_PID=$!
echo $ADMIN_UI_PID > ../.admin-ui.pid
cd ..
print_success "Admin UI started (PID: $ADMIN_UI_PID)"

# Wait for services
echo ""
print_status "Waiting for services to be ready..."
sleep 5

echo ""
print_status "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_status "STEP 5: Verifying Services"
print_status "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""

# Check PostgreSQL
if pg_isready -q 2>/dev/null; then
    print_success "PostgreSQL: Running"
else
    print_warning "PostgreSQL: Not running"
fi

# Check Redis
if redis-cli ping > /dev/null 2>&1; then
    print_success "Redis: Running"
else
    print_warning "Redis: Not running (optional)"
fi

# Check NATS
if check_port 4222; then
    print_success "NATS: Running on port 4222"
else
    print_warning "NATS: Not running (will use polling fallback)"
fi

# Check HAProxy
if check_port 8080; then
    print_success "HAProxy: Running on port 8080"
else
    print_warning "HAProxy: Not running (optional)"
fi

# Check Prometheus
if check_port 9090; then
    print_success "Prometheus: Running on port 9090"
else
    print_warning "Prometheus: Not running (optional)"
fi

# Check FlexGate API
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    print_success "FlexGate API: Accessible on http://localhost:3000"
else
    print_warning "FlexGate API: Not yet ready (check logs/flexgate.log)"
fi

# Check Admin UI
if curl -s http://localhost:3001 > /dev/null 2>&1; then
    print_success "Admin UI: Accessible on http://localhost:3001"
else
    print_warning "Admin UI: Not yet ready (check logs/admin-ui.log)"
fi

# Success banner
echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                    ✅ All Services Started! ✅                       ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════════╝${NC}"

echo ""
echo -e "${CYAN}🗄️  Infrastructure:${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if pg_isready -q 2>/dev/null; then
    echo -e "  ${GREEN}PostgreSQL:${NC}         Running (database: flexgate)"
else
    echo -e "  ${YELLOW}PostgreSQL:${NC}         Not running"
fi

if redis-cli ping > /dev/null 2>&1; then
    echo -e "  ${GREEN}Redis:${NC}              Running (localhost:6379)"
else
    echo -e "  ${YELLOW}Redis:${NC}              Not running (optional)"
fi

if check_port 4222; then
    echo -e "  ${GREEN}NATS/JetStream:${NC}     Running (localhost:4222)"
else
    echo -e "  ${YELLOW}NATS/JetStream:${NC}     Not running (using polling)"
fi

if check_port 8080; then
    echo -e "  ${GREEN}HAProxy:${NC}            Running (localhost:8080)"
else
    echo -e "  ${YELLOW}HAProxy:${NC}            Not running (optional)"
fi

if check_port 9090; then
    echo -e "  ${GREEN}Prometheus:${NC}         Running (localhost:9090)"
else
    echo -e "  ${YELLOW}Prometheus:${NC}         Not running (optional)"
fi

echo ""
echo -e "${CYAN}🌐 Applications:${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  ${GREEN}FlexGate API:${NC}       http://localhost:3000"
echo -e "  ${GREEN}Admin UI:${NC}           http://localhost:3001"
echo -e "  ${GREEN}HAProxy:${NC}            http://localhost:8080 (proxy)"
echo -e "  ${GREEN}Prometheus:${NC}         http://localhost:9090 (metrics)"
echo -e "  ${GREEN}Health Check:${NC}       http://localhost:3000/health"

echo ""
echo -e "${CYAN}📊 Process Info:${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  ${GREEN}FlexGate PID:${NC}       $FLEXGATE_PID"
echo -e "  ${GREEN}Admin UI PID:${NC}       $ADMIN_UI_PID"
if [ -f ".nats.pid" ]; then
    echo -e "  ${GREEN}NATS PID:${NC}           $(cat .nats.pid)"
fi
if [ -f ".haproxy.pid" ]; then
    echo -e "  ${GREEN}HAProxy PID:${NC}        $(cat .haproxy.pid)"
fi
if [ -f ".prometheus.pid" ]; then
    echo -e "  ${GREEN}Prometheus PID:${NC}     $(cat .prometheus.pid)"
fi

echo ""
echo -e "${CYAN}📖 Useful Commands:${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  View FlexGate logs:  tail -f logs/flexgate.log"
echo "  View Admin UI logs:  tail -f logs/admin-ui.log"
echo "  View NATS logs:      tail -f logs/nats.log"
echo "  View HAProxy logs:   tail -f logs/haproxy.log"
echo "  View Prometheus logs: tail -f logs/prometheus.log"
echo "  Stop all services:   ./scripts/stop-all.sh"
echo "  Restart services:    ./scripts/restart-all.sh"

echo ""
echo -e "${GREEN}🚀 FlexGate is ready with all dependencies!${NC}"
echo ""

