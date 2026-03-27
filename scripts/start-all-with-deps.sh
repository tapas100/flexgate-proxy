#!/bin/bash
# start-all-with-deps.sh - Start all FlexGate services and dependencies

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
    echo -e "${BLUE}║             FlexGate - Start All Services & Dependencies            ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_status() { echo -e "${CYAN}==>${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }

print_header

# ============================================
# 1. RUN DEPENDENCY CHECK
# ============================================

print_status "Running comprehensive dependency check..."
echo ""

if [ -f "./scripts/troubleshooting/check-dependencies.sh" ]; then
    ./scripts/troubleshooting/check-dependencies.sh
    DEPENDENCY_STATUS=$?
    
    echo ""
    echo -e "${BLUE}════════════════════════════════════════${NC}"
    echo ""
    
    if [ $DEPENDENCY_STATUS -ne 0 ]; then
        print_warning "Dependency check found issues - will attempt to fix..."
        echo ""
    fi
else
    print_warning "Dependency checker not found, proceeding anyway..."
    echo ""
fi

# ============================================
# 2. CHECK PREREQUISITES
# ============================================

print_status "Checking system prerequisites..."
echo ""

RUNTIME=""
COMPOSE_CMD=""

# Check Node.js
if ! command -v node &> /dev/null; then
    print_error "Node.js not found"
    echo "  Install from: https://nodejs.org/"
    exit 1
fi
NODE_VERSION=$(node --version)
print_success "Node.js: $NODE_VERSION"

# Check npm
if ! command -v npm &> /dev/null; then
    print_error "npm not found"
    exit 1
fi
NPM_VERSION=$(npm --version 2>&1 | grep -v "warn" | head -1)
print_success "npm: v$NPM_VERSION"

# Check container runtime
if command -v podman &> /dev/null; then
    RUNTIME="podman"
    if command -v podman-compose &> /dev/null; then
        COMPOSE_CMD="podman-compose"
    fi
    print_success "Podman: $(podman --version | head -1)"
    
    # Check if Podman machine is running (macOS/Windows)
    if podman machine list 2>/dev/null | grep -q "Currently running"; then
        print_success "Podman machine: running"
    elif podman machine list 2>/dev/null | grep -q "Never\|Stopped"; then
        print_warning "Podman machine not running - starting..."
        podman machine start 2>/dev/null
        if [ $? -eq 0 ]; then
            print_success "Podman machine started"
            sleep 3
        else
            print_error "Failed to start Podman machine"
            echo "  Try manually: podman machine start"
            exit 1
        fi
    fi
elif command -v docker &> /dev/null; then
    RUNTIME="docker"
    if command -v docker-compose &> /dev/null; then
        COMPOSE_CMD="docker-compose"
    fi
    print_success "Docker: $(docker --version)"
else
    print_error "No container runtime found (Podman or Docker required)"
    exit 1
fi

echo ""

# ============================================
# 3. INSTALL/UPDATE DEPENDENCIES
# ============================================

print_status "Checking Node.js dependencies..."
echo ""

# Check API dependencies
if [ ! -d "node_modules" ]; then
    print_warning "node_modules not found - installing..."
    npm install --quiet
    print_success "API dependencies installed"
else
    print_success "API dependencies present"
fi

# Check Admin UI dependencies
if [ -d "admin-ui" ]; then
    if [ ! -d "admin-ui/node_modules" ]; then
        print_warning "Admin UI dependencies not found - installing..."
        cd admin-ui
        npm install --quiet
        cd ..
        print_success "Admin UI dependencies installed"
    else
        print_success "Admin UI dependencies present"
    fi
fi

echo ""

# ============================================
# 4. BUILD TYPESCRIPT
# ============================================

print_status "Building TypeScript..."
echo ""

if [ ! -d "dist" ] || [ ! -f "dist/bin/www" ]; then
    print_warning "TypeScript build missing - building now..."
    npm run build --quiet
    if [ $? -eq 0 ]; then
        print_success "TypeScript compiled successfully"
    else
        print_error "TypeScript compilation failed"
        exit 1
    fi
else
    print_success "TypeScript build present"
fi

echo ""

# ============================================
# 5. SETUP ENVIRONMENT
# ============================================

print_status "Checking environment configuration..."
echo ""

if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        print_warning ".env not found - copying from .env.example"
        cp .env.example .env
        print_success ".env created (please review configuration)"
    else
        print_error ".env not found and no .env.example"
        exit 1
    fi
else
    print_success ".env file present"
fi

# Create logs directory
if [ ! -d "logs" ]; then
    mkdir -p logs
    print_success "Created logs directory"
else
    print_success "logs directory present"
fi

echo ""

# ============================================
# 6. START CONTAINER DEPENDENCIES
# ============================================

print_status "Starting container dependencies..."
echo ""

if [ -n "$RUNTIME" ]; then
    # Start PostgreSQL
    print_status "Starting PostgreSQL..."
    if ! $RUNTIME ps --filter "name=flexgate-postgres" --format "{{.Names}}" 2>/dev/null | grep -q postgres; then
        if [ -n "$COMPOSE_CMD" ] && [ -f "podman-compose.yml" ]; then
            $COMPOSE_CMD -f podman-compose.yml up -d postgres 2>/dev/null
        elif [ -n "$COMPOSE_CMD" ] && [ -f "podman-compose.dev.yml" ]; then
            $COMPOSE_CMD -f podman-compose.dev.yml up -d postgres 2>/dev/null
        else
            # Manual start
            $RUNTIME run -d \
                --name flexgate-postgres \
                -e POSTGRES_USER=flexgate \
                -e POSTGRES_PASSWORD=flexgate \
                -e POSTGRES_DB=flexgate \
                -p 5432:5432 \
                postgres:15-alpine 2>/dev/null
        fi
        sleep 3
        print_success "PostgreSQL started"
    else
        print_success "PostgreSQL already running"
    fi
    
    # Verify PostgreSQL is healthy
    sleep 2
    if $RUNTIME exec flexgate-postgres pg_isready -U flexgate > /dev/null 2>&1; then
        print_success "PostgreSQL is healthy"
    else
        print_warning "PostgreSQL may still be starting up..."
    fi
    
    # Start Redis
    print_status "Starting Redis..."
    if ! $RUNTIME ps --filter "name=flexgate-redis" --format "{{.Names}}" 2>/dev/null | grep -q redis; then
        if [ -n "$COMPOSE_CMD" ] && [ -f "podman-compose.yml" ]; then
            $COMPOSE_CMD -f podman-compose.yml up -d redis 2>/dev/null
        elif [ -n "$COMPOSE_CMD" ] && [ -f "podman-compose.dev.yml" ]; then
            $COMPOSE_CMD -f podman-compose.dev.yml up -d redis 2>/dev/null
        else
            # Manual start
            $RUNTIME run -d \
                --name flexgate-redis \
                -p 6379:6379 \
                redis:7-alpine 2>/dev/null
        fi
        sleep 2
        print_success "Redis started"
    else
        print_success "Redis already running"
    fi
    
    # Verify Redis is healthy
    if $RUNTIME exec flexgate-redis redis-cli ping 2>/dev/null | grep -q PONG; then
        print_success "Redis is healthy"
    else
        print_warning "Redis may still be starting up..."
    fi
    
    # Start HAProxy (optional)
    print_status "Starting HAProxy..."
    if ! $RUNTIME ps --filter "name=flexgate-haproxy" --format "{{.Names}}" 2>/dev/null | grep -q haproxy; then
        if [ -f "haproxy/haproxy.cfg" ]; then
            if [ -n "$COMPOSE_CMD" ] && [ -f "podman-compose.yml" ]; then
                $COMPOSE_CMD -f podman-compose.yml up -d haproxy 2>/dev/null
                print_success "HAProxy started"
            elif [ -n "$COMPOSE_CMD" ] && [ -f "podman-compose.dev.yml" ]; then
                $COMPOSE_CMD -f podman-compose.dev.yml up -d haproxy 2>/dev/null
                print_success "HAProxy started"
            else
                print_warning "HAProxy config found but compose not available"
            fi
        else
            print_warning "HAProxy config not found (skipping)"
        fi
    else
        print_success "HAProxy already running"
    fi
    
    # Start Prometheus (optional)
    print_status "Starting Prometheus..."
    if ! $RUNTIME ps --filter "name=flexgate-prometheus" --format "{{.Names}}" 2>/dev/null | grep -q prometheus; then
        if [ -f "infra/prometheus/prometheus.yml" ] || [ -f "infra/prometheus/prometheus.dev.yml" ]; then
            if [ -n "$COMPOSE_CMD" ] && [ -f "podman-compose.yml" ]; then
                $COMPOSE_CMD -f podman-compose.yml up -d prometheus 2>/dev/null
                if [ $? -eq 0 ]; then
                    print_success "Prometheus started"
                else
                    print_warning "Prometheus start failed (check podman-compose.yml)"
                fi
            elif [ -n "$COMPOSE_CMD" ] && [ -f "podman-compose.dev.yml" ]; then
                $COMPOSE_CMD -f podman-compose.dev.yml up -d prometheus 2>/dev/null
                if [ $? -eq 0 ]; then
                    print_success "Prometheus started"
                else
                    print_warning "Prometheus start failed (check podman-compose.dev.yml)"
                fi
            else
                # Manual start without compose
                PROM_CONFIG="infra/prometheus/prometheus.yml"
                [ -f "infra/prometheus/prometheus.dev.yml" ] && PROM_CONFIG="infra/prometheus/prometheus.dev.yml"
                
                $RUNTIME run -d \
                    --name flexgate-prometheus \
                    -p 9090:9090 \
                    -v "$(pwd)/$PROM_CONFIG:/etc/prometheus/prometheus.yml:ro" \
                    prom/prometheus:latest \
                    --config.file=/etc/prometheus/prometheus.yml \
                    --storage.tsdb.path=/prometheus 2>/dev/null
                
                if [ $? -eq 0 ]; then
                    print_success "Prometheus started (manual)"
                else
                    print_warning "Prometheus start failed"
                fi
            fi
        else
            print_warning "Prometheus config not found (skipping)"
        fi
    else
        print_success "Prometheus already running"
    fi
    
    echo ""
fi

# ============================================
# 7. RUN DATABASE MIGRATIONS
# ============================================

print_status "Checking database schema..."
echo ""

if [ -d "migrations" ]; then
    if $RUNTIME exec flexgate-postgres psql -U flexgate -d flexgate -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'" 2>/dev/null | grep -q "^0$"; then
        print_warning "Database is empty - running migrations..."
        if [ -f "package.json" ] && grep -q "db:migrate" package.json; then
            npm run db:migrate
            print_success "Database migrations completed"
        else
            print_warning "No migration script found in package.json"
        fi
    else
        print_success "Database schema present"
    fi
fi

echo ""

# ============================================
# 8. START FLEXGATE API
# ============================================

print_status "Starting FlexGate API..."
echo ""

# Check if already running
if pgrep -f "node.*bin/www\|node.*app.js" > /dev/null; then
    print_warning "FlexGate API already running - stopping first..."
    pkill -f "node.*bin/www" 2>/dev/null
    pkill -f "node.*app.js" 2>/dev/null
    sleep 2
fi

# Start API in background
nohup npm start > logs/api.log 2>&1 &
API_PID=$!

# Wait for API to start
print_status "Waiting for API to start..."
sleep 3

# Verify API is running
if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
    print_success "FlexGate API started successfully (PID: $API_PID)"
    print_success "API available at: http://localhost:3000"
else
    print_warning "API may still be starting (check logs/api.log)"
fi

echo ""

# ============================================
# 9. START ADMIN UI
# ============================================

if [ -d "admin-ui" ]; then
    print_status "Starting Admin UI..."
    echo ""
    
    # Check if already running
    if pgrep -f "react-scripts start" > /dev/null; then
        print_warning "Admin UI already running - stopping first..."
        pkill -f "react-scripts start" 2>/dev/null
        sleep 2
    fi
    
    # Start Admin UI in background
    cd admin-ui
    nohup npm start > ../logs/admin-ui.log 2>&1 &
    ADMIN_PID=$!
    cd ..
    
    print_success "Admin UI starting (PID: $ADMIN_PID)"
    print_success "Admin UI will be available at: http://localhost:3001"
    print_warning "Note: Admin UI may take 20-30 seconds to compile"
    
    echo ""
fi

# ============================================
# 10. FINAL STATUS CHECK
# ============================================

print_status "Checking service status..."
echo ""

sleep 2

# Check containers
if [ -n "$RUNTIME" ]; then
    CONTAINERS=$($RUNTIME ps --filter "name=flexgate" --format "{{.Names}}" 2>/dev/null | wc -l)
    print_success "$CONTAINERS container(s) running"
fi

# Check ports
if lsof -ti:3000 > /dev/null 2>&1; then
    print_success "Port 3000: FlexGate API"
else
    print_warning "Port 3000: Not in use (API may still be starting)"
fi

if lsof -ti:5432 > /dev/null 2>&1; then
    print_success "Port 5432: PostgreSQL"
fi

if lsof -ti:6379 > /dev/null 2>&1; then
    print_success "Port 6379: Redis"
fi

echo ""

# ============================================
# SUMMARY
# ============================================

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                            STARTUP COMPLETE                          ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo "Services started:"
echo ""
echo "  🗄️  PostgreSQL:  running on port 5432"
echo "  💾  Redis:       running on port 6379"
echo "  🚀  FlexGate API: http://localhost:3000"
echo "  🎨  Admin UI:    http://localhost:3001 (compiling...)"
echo ""
echo "Useful commands:"
echo "  • View logs:          tail -f logs/api.log"
echo "  • View Admin UI logs: tail -f logs/admin-ui.log"
echo "  • Check health:       curl http://localhost:3000/health"
echo "  • Stop all:           ./scripts/stop-all-with-deps.sh"
echo "  • Auto-recover:       ./scripts/troubleshooting/auto-recover.sh"
echo ""

print_success "All services started successfully!"
