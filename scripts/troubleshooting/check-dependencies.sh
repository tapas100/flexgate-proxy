#!/bin/bash
# check-dependencies.sh - Check all FlexGate API server dependencies

echo "🔍 FlexGate API Server Dependency Check"
echo "========================================"
echo ""

ISSUES_FOUND=0

# ============================================
# 1. SYSTEM REQUIREMENTS
# ============================================

echo "📦 System Requirements"
echo "----------------------"

# Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found"
    echo "   💡 Install from: https://nodejs.org/ (Required: v18+)"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
else
    NODE_VERSION=$(node --version)
    echo "✅ Node.js: $NODE_VERSION"
fi

# npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm not found"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
else
    NPM_VERSION=$(npm --version)
    echo "✅ npm: v$NPM_VERSION"
fi

# Container runtime
if command -v podman &> /dev/null; then
    PODMAN_VERSION=$(podman --version)
    echo "✅ Podman: $PODMAN_VERSION"
elif command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version)
    echo "✅ Docker: $DOCKER_VERSION"
else
    echo "❌ No container runtime found (Podman or Docker)"
    echo "   💡 Install Podman: brew install podman"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

echo ""

# ============================================
# 2. NODE.JS DEPENDENCIES
# ============================================

echo "📚 Node.js Dependencies"
echo "----------------------"

if [ ! -d "node_modules" ]; then
    echo "❌ node_modules directory not found"
    echo "   💡 Run: npm install"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
else
    echo "✅ node_modules directory exists"
    
    # Check critical dependencies
    CRITICAL_DEPS=(
        "express:Express web framework"
        "pg:PostgreSQL client"
        "redis:Redis client"
        "winston:Logging library"
        "prom-client:Prometheus metrics"
        "http-proxy-middleware:Proxy middleware"
        "express-rate-limit:Rate limiting"
    )
    
    for dep in "${CRITICAL_DEPS[@]}"; do
        IFS=':' read -r pkg desc <<< "$dep"
        if [ -d "node_modules/$pkg" ]; then
            echo "   ✅ $desc ($pkg)"
        else
            echo "   ❌ $desc ($pkg) - MISSING"
            ISSUES_FOUND=$((ISSUES_FOUND + 1))
        fi
    done
fi

echo ""

# ============================================
# 3. TYPESCRIPT BUILD
# ============================================

echo "🔨 TypeScript Build"
echo "-------------------"

if [ ! -d "dist" ]; then
    echo "❌ dist/ directory not found"
    echo "   💡 Run: npm run build"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
else
    echo "✅ dist/ directory exists"
    
    # Check entry points
    if [ -f "dist/bin/www" ] || [ -f "dist/bin/www.js" ]; then
        echo "   ✅ Entry point: dist/bin/www"
    else
        echo "   ❌ Entry point missing: dist/bin/www"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
    
    if [ -f "dist/app.js" ]; then
        echo "   ✅ Main app: dist/app.js"
    else
        echo "   ⚠️  Main app missing: dist/app.js"
    fi
fi

echo ""

# ============================================
# 4. ENVIRONMENT CONFIGURATION
# ============================================

echo "⚙️  Environment Configuration"
echo "----------------------------"

if [ ! -f ".env" ]; then
    echo "❌ .env file not found"
    if [ -f ".env.example" ]; then
        echo "   💡 Copy: cp .env.example .env"
    fi
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
else
    echo "✅ .env file exists"
    
    # Check critical env vars
    if grep -q "^DATABASE_URL\|^DB_HOST" .env 2>/dev/null; then
        echo "   ✅ Database configuration found"
    else
        echo "   ⚠️  Database configuration may be missing"
    fi
    
    if grep -q "^REDIS_URL\|^REDIS_HOST" .env 2>/dev/null; then
        echo "   ✅ Redis configuration found"
    else
        echo "   ⚠️  Redis configuration may be missing"
    fi
    
    if grep -q "^PORT" .env 2>/dev/null; then
        PORT=$(grep "^PORT=" .env | cut -d= -f2)
        echo "   ✅ API Port configured: $PORT"
    else
        echo "   ⚠️  PORT not configured (will use default 3000)"
    fi
    
    if grep -q "^NODE_ENV" .env 2>/dev/null; then
        NODE_ENV=$(grep "^NODE_ENV=" .env | cut -d= -f2)
        echo "   ℹ️  Environment: $NODE_ENV"
    fi
fi

echo ""

# ============================================
# 5. DATABASE (PostgreSQL)
# ============================================

echo "🗄️  PostgreSQL Database"
echo "----------------------"

if command -v podman &> /dev/null; then
    RUNTIME="podman"
elif command -v docker &> /dev/null; then
    RUNTIME="docker"
fi

if [ -n "$RUNTIME" ]; then
    if $RUNTIME ps --filter "name=flexgate-postgres" --format "{{.Names}}" 2>/dev/null | grep -q postgres; then
        echo "✅ PostgreSQL container running"
        
        # Check if it's responsive
        if $RUNTIME exec flexgate-postgres pg_isready -U flexgate > /dev/null 2>&1; then
            echo "   ✅ PostgreSQL accepting connections"
            
            # Check if we can query
            if $RUNTIME exec flexgate-postgres psql -U flexgate -d flexgate -c "SELECT 1" > /dev/null 2>&1; then
                echo "   ✅ PostgreSQL can execute queries"
                
                # Check table count
                TABLE_COUNT=$($RUNTIME exec flexgate-postgres psql -U flexgate -d flexgate -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'" 2>/dev/null | tr -d '\r')
                if [ "$TABLE_COUNT" -eq 0 ]; then
                    echo "   ⚠️  Database is empty - need migrations"
                    echo "   💡 Run: npm run db:migrate"
                else
                    echo "   ✅ Database has $TABLE_COUNT tables"
                fi
            else
                echo "   ❌ PostgreSQL cannot execute queries"
                ISSUES_FOUND=$((ISSUES_FOUND + 1))
            fi
        else
            echo "   ❌ PostgreSQL not accepting connections"
            ISSUES_FOUND=$((ISSUES_FOUND + 1))
        fi
    else
        echo "❌ PostgreSQL container not running"
        echo "   💡 Start with: podman-compose -f podman-compose.dev.yml up -d postgres"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
fi

echo ""

# ============================================
# 6. CACHE (Redis)
# ============================================

echo "💾 Redis Cache"
echo "--------------"

if [ -n "$RUNTIME" ]; then
    if $RUNTIME ps --filter "name=flexgate-redis" --format "{{.Names}}" 2>/dev/null | grep -q redis; then
        echo "✅ Redis container running"
        
        # Check if it's responsive
        if $RUNTIME exec flexgate-redis redis-cli ping 2>/dev/null | grep -q PONG; then
            echo "   ✅ Redis accepting connections"
            
            # Check memory usage
            REDIS_MEM=$($RUNTIME exec flexgate-redis redis-cli INFO memory 2>/dev/null | grep "used_memory_human" | cut -d: -f2 | tr -d '\r')
            if [ -n "$REDIS_MEM" ]; then
                echo "   ℹ️  Memory usage: $REDIS_MEM"
            fi
            
            # Check key count
            KEY_COUNT=$($RUNTIME exec flexgate-redis redis-cli DBSIZE 2>/dev/null | tr -d '\r')
            if [ -n "$KEY_COUNT" ]; then
                echo "   ℹ️  Keys stored: $KEY_COUNT"
            fi
        else
            echo "   ❌ Redis not responding to PING"
            ISSUES_FOUND=$((ISSUES_FOUND + 1))
        fi
    else
        echo "❌ Redis container not running"
        echo "   💡 Start with: podman-compose -f podman-compose.dev.yml up -d redis"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
fi

echo ""

# ============================================
# 7. SYSTEM TOOLS
# ============================================

echo "🔧 System Tools"
echo "---------------"

REQUIRED_TOOLS=("curl" "lsof" "grep" "awk")
OPTIONAL_TOOLS=("psql" "jq" "netstat")

for tool in "${REQUIRED_TOOLS[@]}"; do
    if command -v $tool &> /dev/null; then
        echo "✅ $tool"
    else
        echo "❌ $tool - REQUIRED"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
done

for tool in "${OPTIONAL_TOOLS[@]}"; do
    if command -v $tool &> /dev/null; then
        echo "✅ $tool (optional)"
    else
        echo "ℹ️  $tool not found (optional but recommended)"
    fi
done

echo ""

# ============================================
# 8. NETWORK PORTS
# ============================================

echo "🌐 Network Ports"
echo "----------------"

REQUIRED_PORTS=("3000:FlexGate API" "5432:PostgreSQL" "6379:Redis")

for port_desc in "${REQUIRED_PORTS[@]}"; do
    IFS=':' read -r port service <<< "$port_desc"
    
    if lsof -ti:$port > /dev/null 2>&1; then
        PID=$(lsof -ti:$port)
        PROCESS=$(ps -p $PID -o comm= 2>/dev/null || echo "unknown")
        echo "✅ Port $port: $service ($PROCESS, PID: $PID)"
    else
        echo "⚠️  Port $port: $service - NOT IN USE"
        if [ "$port" = "3000" ]; then
            echo "   💡 API server may not be running"
        fi
    fi
done

echo ""

# ============================================
# 9. FILE SYSTEM
# ============================================

echo "📁 File System"
echo "--------------"

# Check log directory
if [ -d "logs" ]; then
    LOG_SIZE=$(du -sh logs 2>/dev/null | cut -f1)
    echo "✅ logs/ directory exists ($LOG_SIZE)"
else
    echo "⚠️  logs/ directory missing"
    echo "   💡 Will be created automatically on first run"
fi

# Check disk space
DISK_USAGE=$(df -h . | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt 90 ]; then
    echo "❌ Disk usage critical: ${DISK_USAGE}%"
    echo "   💡 Clean up space: rm -rf logs/*.old"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
elif [ "$DISK_USAGE" -gt 80 ]; then
    echo "⚠️  Disk usage high: ${DISK_USAGE}%"
else
    echo "✅ Disk usage acceptable: ${DISK_USAGE}%"
fi

echo ""

# ============================================
# 10. DATABASE SCHEMA
# ============================================

if [ -f "migrations/001_initial_schema.sql" ] || [ -d "migrations" ]; then
    echo "🗂️  Database Schema"
    echo "------------------"
    
    if [ -n "$RUNTIME" ] && $RUNTIME ps --filter "name=flexgate-postgres" --format "{{.Names}}" 2>/dev/null | grep -q postgres; then
        # Check for critical tables
        CRITICAL_TABLES=("routes" "settings" "metrics" "health_checks")
        
        for table in "${CRITICAL_TABLES[@]}"; do
            if $RUNTIME exec flexgate-postgres psql -U flexgate -d flexgate -tAc "SELECT to_regclass('public.$table')" 2>/dev/null | grep -q "$table"; then
                echo "✅ Table exists: $table"
            else
                echo "⚠️  Table missing: $table"
            fi
        done
        
        echo ""
    fi
fi

# ============================================
# SUMMARY
# ============================================

echo "========================================"
if [ $ISSUES_FOUND -eq 0 ]; then
    echo "✅ ALL DEPENDENCIES SATISFIED"
    echo ""
    echo "FlexGate API server is ready to run!"
    echo "Start with: npm start"
    exit 0
else
    echo "⚠️  $ISSUES_FOUND ISSUE(S) FOUND"
    echo ""
    echo "Please resolve the issues above before starting the API server."
    echo ""
    echo "Quick fixes:"
    echo "  • Missing dependencies: npm install"
    echo "  • Missing build: npm run build"
    echo "  • Missing .env: cp .env.example .env"
    echo "  • Database not running: podman-compose -f podman-compose.dev.yml up -d postgres"
    echo "  • Redis not running: podman-compose -f podman-compose.dev.yml up -d redis"
    exit 1
fi
