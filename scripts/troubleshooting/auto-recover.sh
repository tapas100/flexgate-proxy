#!/bin/bash
# auto-recover.sh - Automatic recovery of failed services

echo "🔧 FlexGate Auto-Recovery System"
echo ""

RECOVERY_NEEDED=0

# Determine container runtime
RUNTIME=""
if command -v podman &> /dev/null; then
    RUNTIME="podman"
elif command -v docker &> /dev/null; then
    RUNTIME="docker"
fi

# 1. Check PostgreSQL
echo "🔍 Checking PostgreSQL..."
if [ -n "$RUNTIME" ]; then
    if ! $RUNTIME ps --filter "name=flexgate-postgres" --format "{{.Names}}" 2>/dev/null | grep -q postgres; then
        echo "   ❌ PostgreSQL is down"
        echo "   🔧 Attempting to restart..."
        
        if [ "$RUNTIME" = "podman" ]; then
            podman-compose -f podman-compose.dev.yml up -d postgres
        else
            docker-compose -f podman-compose.dev.yml up -d postgres
        fi
        
        sleep 5
        RECOVERY_NEEDED=1
    else
        # Check if it's healthy
        if ! $RUNTIME exec flexgate-postgres pg_isready -U flexgate > /dev/null 2>&1; then
            echo "   ❌ PostgreSQL not responding"
            echo "   🔧 Restarting PostgreSQL..."
            $RUNTIME restart flexgate-postgres
            sleep 5
            RECOVERY_NEEDED=1
        else
            echo "   ✅ PostgreSQL is healthy"
        fi
    fi
fi

# 2. Check Redis
echo ""
echo "🔍 Checking Redis..."
if [ -n "$RUNTIME" ]; then
    if ! $RUNTIME ps --filter "name=flexgate-redis" --format "{{.Names}}" 2>/dev/null | grep -q redis; then
        echo "   ❌ Redis is down"
        echo "   🔧 Attempting to restart..."
        
        if [ "$RUNTIME" = "podman" ]; then
            podman-compose -f podman-compose.dev.yml up -d redis
        else
            docker-compose -f podman-compose.dev.yml up -d redis
        fi
        
        sleep 3
        RECOVERY_NEEDED=1
    else
        # Check if it's healthy
        if ! $RUNTIME exec flexgate-redis redis-cli ping 2>/dev/null | grep -q PONG; then
            echo "   ❌ Redis not responding"
            echo "   🔧 Restarting Redis..."
            $RUNTIME restart flexgate-redis
            sleep 3
            RECOVERY_NEEDED=1
        else
            echo "   ✅ Redis is healthy"
        fi
    fi
fi

# 3. Check FlexGate API
echo ""
echo "🔍 Checking FlexGate API..."
if ! curl -sf http://localhost:3000/health > /dev/null 2>&1; then
    echo "   ❌ FlexGate API is down"
    
    # Check if process is running but unresponsive
    if pgrep -f "node.*app.ts" > /dev/null || pgrep -f "node.*dist/app.js" > /dev/null; then
        echo "   🔧 Process found but unresponsive, killing..."
        pkill -f "node.*app.ts"
        pkill -f "node.*dist/app.js"
        sleep 2
    fi
    
    echo "   🔧 Starting FlexGate..."
    npm start &
    sleep 5
    RECOVERY_NEEDED=1
else
    echo "   ✅ FlexGate API is healthy"
fi

# 4. If containers were restarted, check database connectivity
if [ $RECOVERY_NEEDED -eq 1 ]; then
    echo ""
    echo "🔍 Verifying database connectivity..."
    
    # Wait a bit more for everything to settle
    sleep 3
    
    # Try to connect
    if command -v psql &> /dev/null; then
        if PGPASSWORD=flexgate psql -h localhost -U flexgate -d flexgate -c "SELECT 1" > /dev/null 2>&1; then
            echo "   ✅ Database connection successful"
        else
            echo "   ⚠️  Database connection failed"
            echo "   Manual intervention may be needed"
        fi
    fi
fi

# 5. Run health check
echo ""
echo "🏥 Running comprehensive health check..."
if [ -f "./scripts/troubleshooting/health-check.sh" ]; then
    ./scripts/troubleshooting/health-check.sh
else
    echo "⚠️  Health check script not found"
    
    # Basic checks
    if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
        echo "✅ FlexGate API: healthy"
    else
        echo "❌ FlexGate API: failed"
    fi
fi

# Summary
echo ""
echo "================================================"
if [ $RECOVERY_NEEDED -eq 1 ]; then
    echo "🔧 Recovery actions performed"
    echo ""
    echo "Please verify:"
    echo "  1. Check logs: tail -f logs/combined.log"
    echo "  2. Test API: curl http://localhost:3000/health"
    echo "  3. Check Admin UI: http://localhost:3001"
else
    echo "✅ No recovery needed - all services healthy"
fi
