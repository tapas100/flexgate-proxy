# FlexGate Installation Troubleshooting Guide

## Overview

This guide covers common installation failures, how to diagnose them, and recovery procedures.

---

## Table of Contents

1. [Pre-Installation Checks](#pre-installation-checks)
2. [Common Installation Failures](#common-installation-failures)
3. [Database Issues](#database-issues)
4. [Redis Issues](#redis-issues)
5. [Container/Podman Issues](#containerpodman-issues)
6. [Admin UI Build Failures](#admin-ui-build-failures)
7. [Network & Port Conflicts](#network--port-conflicts)
8. [Recovery Procedures](#recovery-procedures)
9. [Rollback & Clean Restart](#rollback--clean-restart)
10. [Health Check Scripts](#health-check-scripts)

---

## Pre-Installation Checks

### System Requirements Check Script

```bash
#!/bin/bash
# check-requirements.sh

echo "🔍 Checking FlexGate Requirements..."
echo ""

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    echo "✅ Node.js installed: $NODE_VERSION"
    
    # Check if version >= 16
    MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'v' -f2 | cut -d'.' -f1)
    if [ $MAJOR_VERSION -lt 16 ]; then
        echo "❌ Node.js version must be >= 16.x"
        exit 1
    fi
else
    echo "❌ Node.js not installed"
    echo "   Install from: https://nodejs.org/"
    exit 1
fi

# Check npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm -v)
    echo "✅ npm installed: $NPM_VERSION"
else
    echo "❌ npm not installed"
    exit 1
fi

# Check Podman or Docker
if command -v podman &> /dev/null; then
    PODMAN_VERSION=$(podman -v)
    echo "✅ Podman installed: $PODMAN_VERSION"
elif command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker -v)
    echo "✅ Docker installed: $DOCKER_VERSION"
else
    echo "⚠️  Neither Podman nor Docker installed"
    echo "   Required for Standard/Production modes"
    echo "   Simple mode will still work"
fi

# Check available ports
echo ""
echo "🔍 Checking port availability..."

check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo "❌ Port $1 already in use"
        lsof -i :$1 | grep LISTEN
        return 1
    else
        echo "✅ Port $1 available"
        return 0
    fi
}

check_port 3000  # FlexGate backend
check_port 3001  # Admin UI / Grafana
check_port 5432  # PostgreSQL
check_port 6379  # Redis
check_port 8080  # HAProxy
check_port 9090  # Prometheus

# Check disk space
echo ""
echo "🔍 Checking disk space..."
AVAILABLE_SPACE=$(df -h . | awk 'NR==2 {print $4}')
echo "Available disk space: $AVAILABLE_SPACE"

# Check memory
echo ""
echo "🔍 Checking available memory..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    MEMORY=$(sysctl hw.memsize | awk '{print $2/1024/1024/1024 " GB"}')
    echo "Total memory: $MEMORY"
elif [[ "$OSTYPE" == "linux"* ]]; then
    MEMORY=$(free -h | awk '/^Mem:/ {print $2}')
    echo "Total memory: $MEMORY"
fi

echo ""
echo "✅ Pre-installation checks complete!"
```

**Usage:**
```bash
chmod +x check-requirements.sh
./check-requirements.sh
```

---

## Common Installation Failures

### 1. npm install Failures

#### Error: EACCES permission denied

**Problem:**
```bash
npm ERR! code EACCES
npm ERR! syscall access
npm ERR! path /usr/local/lib/node_modules
npm ERR! errno -13
```

**Solution:**
```bash
# Option 1: Fix npm permissions (recommended)
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.zshrc
source ~/.zshrc

# Option 2: Use npx (no global install)
npx flexgate-proxy init

# Option 3: Use sudo (not recommended)
sudo npm install -g flexgate-proxy
```

---

#### Error: Network timeout

**Problem:**
```bash
npm ERR! network request to https://registry.npmjs.org/flexgate-proxy failed
npm ERR! network This is a problem related to network connectivity
```

**Solution:**
```bash
# 1. Check internet connection
ping registry.npmjs.org

# 2. Clear npm cache
npm cache clean --force

# 3. Use different registry
npm config set registry https://registry.npmjs.org/

# 4. Increase timeout
npm install flexgate-proxy --timeout=60000

# 5. Try yarn instead
yarn add flexgate-proxy
```

---

#### Error: Incompatible dependencies

**Problem:**
```bash
npm ERR! code ERESOLVE
npm ERR! ERESOLVE unable to resolve dependency tree
```

**Solution:**
```bash
# Option 1: Use --legacy-peer-deps
npm install flexgate-proxy --legacy-peer-deps

# Option 2: Use --force (last resort)
npm install flexgate-proxy --force

# Option 3: Clean install
rm -rf node_modules package-lock.json
npm install

# Option 4: Check Node.js version
node -v  # Should be >= 16.x
nvm use 18  # If using nvm
```

---

### 2. Build Failures

#### TypeScript Compilation Errors

**Problem:**
```bash
error TS2307: Cannot find module '@types/node'
```

**Solution:**
```bash
# Install missing types
npm install --save-dev @types/node @types/express

# Clean build
rm -rf dist
npm run build

# If still failing, check tsconfig.json
cat tsconfig.json
```

---

#### Admin UI Build Failures

**Problem:**
```bash
Creating an optimized production build...
Failed to compile.
```

**Solution:**
```bash
cd admin-ui

# Check for errors
npm run build 2>&1 | tee build.log

# Clear cache
rm -rf node_modules/.cache
rm -rf build

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Try build again
npm run build

# If memory issues
NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

---

## Database Issues

### PostgreSQL Connection Failed

#### Error: Connection refused

**Problem:**
```bash
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Diagnosis:**
```bash
# Check if PostgreSQL container is running
podman ps | grep postgres

# Check PostgreSQL logs
podman logs flexgate-postgres

# Try connecting manually
psql -h localhost -U flexgate -d flexgate
```

**Solutions:**

**Solution 1: Container not started**
```bash
# Start PostgreSQL
npm run db:start

# Wait for ready
sleep 5

# Check status
podman ps | grep postgres
```

**Solution 2: Wrong credentials**
```bash
# Check .env file
cat .env | grep DATABASE

# Update if needed
DATABASE_URL=postgresql://flexgate:flexgate@localhost:5432/flexgate
```

**Solution 3: Port conflict**
```bash
# Check what's using port 5432
lsof -i :5432

# Kill conflicting process
kill -9 <PID>

# Or use different port
podman-compose -f podman-compose.dev.yml down
# Edit podman-compose.dev.yml: "5433:5432"
podman-compose -f podman-compose.dev.yml up -d
```

**Solution 4: Container unhealthy**
```bash
# Check container health
podman inspect flexgate-postgres | grep -A 10 Health

# Restart container
podman restart flexgate-postgres

# Or recreate
podman-compose -f podman-compose.dev.yml down -v
podman-compose -f podman-compose.dev.yml up -d
```

---

#### Migration Failures

**Problem:**
```bash
Error: relation "routes" already exists
```

**Solution:**
```bash
# Check migration status
npm run db:migrate -- --status

# Reset database (WARNING: loses data)
npm run db:reset

# Or manually fix
psql -h localhost -U flexgate -d flexgate -c "DROP TABLE IF EXISTS routes CASCADE;"
npm run db:migrate
```

---

### Schema Corruption

**Problem:**
```bash
Error: column "created_at" does not exist
```

**Recovery:**
```bash
# Backup existing data (if any)
podman exec flexgate-postgres pg_dump -U flexgate flexgate > backup.sql

# Reset database
npm run db:reset

# Or drop and recreate
psql -h localhost -U flexgate -d flexgate -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
npm run db:migrate

# Restore data if needed
psql -h localhost -U flexgate flexgate < backup.sql
```

---

## Redis Issues

### Redis Connection Failed

**Problem:**
```bash
Error: Redis connection to localhost:6379 failed - connect ECONNREFUSED
```

**Diagnosis:**
```bash
# Check if Redis is running
podman ps | grep redis

# Check Redis logs
podman logs flexgate-redis

# Test connection
redis-cli -h localhost -p 6379 ping
```

**Solutions:**

**Solution 1: Start Redis**
```bash
npm run db:start
# OR
podman-compose -f podman-compose.dev.yml up -d redis
```

**Solution 2: Port conflict**
```bash
# Check port 6379
lsof -i :6379

# Kill process or use different port
# Edit podman-compose.dev.yml: "6380:6379"
# Update .env: REDIS_URL=redis://localhost:6380
```

**Solution 3: Redis crashed**
```bash
# Check logs
podman logs flexgate-redis --tail=50

# Restart
podman restart flexgate-redis

# If corrupt data
podman exec flexgate-redis redis-cli FLUSHALL
```

---

## Container/Podman Issues

### Podman Not Found

**Problem:**
```bash
npm run podman:run
podman: command not found
```

**Solution:**
```bash
# macOS
brew install podman
podman machine init
podman machine start

# Linux
sudo apt-get install podman  # Debian/Ubuntu
sudo dnf install podman       # Fedora/RHEL

# Verify
podman --version
```

---

### Image Build Failures

**Problem:**
```bash
npm run podman:build
Error: error building at STEP "RUN npm ci"
```

**Solutions:**

**Solution 1: Network issues**
```bash
# Build with retry
podman build -t localhost/flexgate-proxy:latest . --retry=3

# Use BuildKit cache
podman build --no-cache -t localhost/flexgate-proxy:latest .
```

**Solution 2: Insufficient resources**
```bash
# Increase Podman machine resources (macOS)
podman machine stop
podman machine set --memory=4096 --cpus=4
podman machine start

# Check available space
df -h
```

**Solution 3: Dependency issues**
```bash
# Update Dockerfile with --legacy-peer-deps
# Edit Dockerfile:
# RUN npm ci --only=production --legacy-peer-deps
podman build -t localhost/flexgate-proxy:latest .
```

---

### Container Won't Start

**Problem:**
```bash
npm run podman:run
Error: container died unexpectedly
```

**Diagnosis:**
```bash
# Check container logs
podman logs flexgate-app-1

# Check container status
podman ps -a | grep flexgate

# Inspect container
podman inspect flexgate-app-1
```

**Solutions:**

**Solution 1: Port conflict**
```bash
# Check what's using ports
lsof -i :3000
lsof -i :8080

# Kill processes
kill -9 <PID>

# Or edit port mapping in podman-compose.yml
```

**Solution 2: Missing environment variables**
```bash
# Check .env file exists
cat .env

# Create if missing
cat > .env << EOF
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://flexgate:flexgate@postgres:5432/flexgate
REDIS_URL=redis://redis:6379
EOF
```

**Solution 3: Database not ready**
```bash
# Ensure database starts first
podman-compose up -d postgres redis
sleep 5
podman-compose up -d flexgate-app-1 flexgate-app-2
```

---

## Admin UI Build Failures

### React Build Errors

**Problem:**
```bash
cd admin-ui && npm run build
Failed to compile.
```

**Solutions:**

**Solution 1: Clear cache**
```bash
cd admin-ui
rm -rf node_modules/.cache
rm -rf build
npm cache clean --force
npm install
npm run build
```

**Solution 2: Memory issues**
```bash
# Increase Node.js memory
NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

**Solution 3: Dependency issues**
```bash
cd admin-ui
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
npm run build
```

---

### TypeScript Type Errors

**Problem:**
```bash
Type error: Property 'item' does not exist on type...
```

**Solution:**
```bash
# Update @mui/material types
cd admin-ui
npm install --save-dev @types/react@latest @mui/material@latest

# Or skip type checking in build
SKIP_PREFLIGHT_CHECK=true npm run build

# Or update tsconfig.json to be more lenient
```

---

## Network & Port Conflicts

### Port Already in Use

**Problem:**
```bash
Error: listen EADDRINUSE: address already in use :::3000
```

**Solutions:**

**Solution 1: Kill process**
```bash
# Find process using port 3000
lsof -ti:3000

# Kill it
kill -9 $(lsof -ti:3000)

# Or use different port
PORT=3001 npm start
```

**Solution 2: Change default ports**
```bash
# Edit .env
PORT=3100

# For containers, edit podman-compose.yml
# ports:
#   - "3100:3000"
```

---

### Proxy Configuration Issues

**Problem:**
```bash
Admin UI can't connect to backend API
```

**Solutions:**

**Solution 1: Check proxy config**
```bash
# admin-ui/package.json should have:
{
  "proxy": "http://localhost:3000"
}
```

**Solution 2: CORS errors**
```bash
# Update FlexGate CORS settings
# Via Admin UI: Settings → Security → CORS
# Or in .env:
CORS_ORIGIN=http://localhost:3001
```

---

## Recovery Procedures

### Complete Clean Install

```bash
#!/bin/bash
# clean-install.sh

echo "🧹 Starting clean FlexGate installation..."

# 1. Stop all services
echo "Stopping services..."
npm run podman:stop 2>/dev/null || true
npm run db:stop 2>/dev/null || true

# 2. Remove containers and volumes
echo "Removing containers and volumes..."
podman-compose -f podman-compose.yml down -v 2>/dev/null || true
podman-compose -f podman-compose.dev.yml down -v 2>/dev/null || true

# 3. Remove node_modules
echo "Cleaning dependencies..."
rm -rf node_modules
rm -rf admin-ui/node_modules
rm -rf package-lock.json
rm -rf admin-ui/package-lock.json

# 4. Clean build artifacts
echo "Cleaning build artifacts..."
rm -rf dist
rm -rf admin-ui/build
rm -rf admin-ui/.cache

# 5. Reinstall dependencies
echo "Installing dependencies..."
npm install

cd admin-ui
npm install
cd ..

# 6. Build FlexGate
echo "Building FlexGate..."
npm run build

# 7. Build Admin UI
echo "Building Admin UI..."
cd admin-ui
npm run build
cd ..

# 8. Start services
echo "Starting services..."
npm run db:start
sleep 5

# 9. Run migrations
echo "Running migrations..."
npm run db:migrate

# 10. Start FlexGate
echo "Starting FlexGate..."
npm start &

echo ""
echo "✅ Clean installation complete!"
echo "🌐 FlexGate: http://localhost:3000"
echo "🎨 Admin UI: http://localhost:8080/admin"
```

---

### Partial Recovery (Keep Data)

```bash
#!/bin/bash
# partial-recovery.sh

echo "🔧 Starting partial recovery..."

# Keep database volumes, just restart services

# 1. Stop FlexGate
echo "Stopping FlexGate..."
pkill -f "node.*flexgate"
podman stop flexgate-app-1 flexgate-app-2 2>/dev/null || true

# 2. Keep database running, just check health
echo "Checking database..."
if ! podman ps | grep -q flexgate-postgres; then
    echo "Starting PostgreSQL..."
    podman-compose -f podman-compose.dev.yml up -d postgres
    sleep 3
fi

if ! podman ps | grep -q flexgate-redis; then
    echo "Starting Redis..."
    podman-compose -f podman-compose.dev.yml up -d redis
    sleep 2
fi

# 3. Rebuild only what's needed
echo "Rebuilding..."
npm run build

# 4. Restart FlexGate
echo "Restarting FlexGate..."
npm start

echo "✅ Partial recovery complete!"
```

---

## Rollback & Clean Restart

### Version Rollback

```bash
# If new version breaks, rollback to previous

# 1. Check npm version history
npm view flexgate-proxy versions

# 2. Install specific version
npm install flexgate-proxy@0.1.0-beta.1

# 3. Or use git tags
git checkout v0.1.0-beta.1
npm install
npm run build
npm start
```

---

### Database Rollback

```bash
# Rollback to previous migration

# 1. Check current version
npm run db:migrate -- --status

# 2. Rollback one migration
npm run db:migrate -- --down

# 3. Or reset completely
npm run db:reset
```

---

## Health Check Scripts

### Automated Health Check

```bash
#!/bin/bash
# health-check.sh

echo "🏥 Running FlexGate health checks..."

FAILED=0

# Check FlexGate API
echo "Checking FlexGate API..."
if curl -sf http://localhost:3000/health > /dev/null; then
    echo "✅ FlexGate API: healthy"
else
    echo "❌ FlexGate API: failed"
    FAILED=1
fi

# Check PostgreSQL
echo "Checking PostgreSQL..."
if podman exec flexgate-postgres pg_isready -U flexgate > /dev/null 2>&1; then
    echo "✅ PostgreSQL: healthy"
else
    echo "❌ PostgreSQL: failed"
    FAILED=1
fi

# Check Redis
echo "Checking Redis..."
if podman exec flexgate-redis redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis: healthy"
else
    echo "❌ Redis: failed"
    FAILED=1
fi

# Check Admin UI (if built)
if [ -d "admin-ui/build" ]; then
    echo "✅ Admin UI: built"
else
    echo "⚠️  Admin UI: not built (run: cd admin-ui && npm run build)"
fi

# Summary
echo ""
if [ $FAILED -eq 0 ]; then
    echo "✅ All health checks passed!"
    exit 0
else
    echo "❌ Some health checks failed!"
    echo "Run: npm run db:start"
    exit 1
fi
```

---

### Auto-Recovery Script

```bash
#!/bin/bash
# auto-recover.sh

echo "🔧 Attempting auto-recovery..."

# Check what's failing and try to fix

# 1. Check if PostgreSQL is down
if ! podman ps | grep -q flexgate-postgres; then
    echo "PostgreSQL down, restarting..."
    podman-compose -f podman-compose.dev.yml up -d postgres
    sleep 5
fi

# 2. Check if Redis is down
if ! podman ps | grep -q flexgate-redis; then
    echo "Redis down, restarting..."
    podman-compose -f podman-compose.dev.yml up -d redis
    sleep 3
fi

# 3. Check if FlexGate is down
if ! curl -sf http://localhost:3000/health > /dev/null; then
    echo "FlexGate down, restarting..."
    pkill -f "node.*flexgate"
    sleep 2
    npm start &
    sleep 5
fi

# 4. Run health check
./health-check.sh
```

---

## Emergency Procedures

### Total Reset (Nuclear Option)

```bash
#!/bin/bash
# nuclear-reset.sh

echo "☢️  WARNING: This will delete ALL data!"
read -p "Are you sure? (type 'yes' to continue): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Cancelled."
    exit 0
fi

echo "Performing total reset..."

# Stop everything
podman stop $(podman ps -aq) 2>/dev/null || true
pkill -f node

# Remove all FlexGate containers and volumes
podman rm -f $(podman ps -aq --filter "name=flexgate") 2>/dev/null || true
podman volume rm $(podman volume ls -q --filter "name=flexgate") 2>/dev/null || true

# Remove all node_modules
find . -name "node_modules" -type d -prune -exec rm -rf {} \;

# Remove all build artifacts
rm -rf dist admin-ui/build

# Clean npm cache
npm cache clean --force

# Start fresh
echo "Ready for fresh install. Run: npm install"
```

---

## Logging & Debugging

### Enable Debug Logging

```bash
# Enable verbose npm logs
npm install --loglevel verbose

# Enable FlexGate debug logs
DEBUG=flexgate:* npm start

# Enable all logs
DEBUG=* npm start

# Save logs to file
npm start 2>&1 | tee flexgate.log
```

---

### Check System Logs

```bash
# Container logs
podman logs flexgate-app-1 --tail=100 -f

# Database logs
podman logs flexgate-postgres --tail=50

# All services
podman-compose -f podman-compose.yml logs -f
```

---

## Summary Checklist

### When Installation Fails:

1. ✅ **Check pre-requirements** (`./check-requirements.sh`)
2. ✅ **Check logs** (npm, podman, console)
3. ✅ **Verify ports** are available
4. ✅ **Check dependencies** are installed
5. ✅ **Try clean install** (`./clean-install.sh`)
6. ✅ **Check database** is running
7. ✅ **Check Redis** is running
8. ✅ **Run health checks** (`./health-check.sh`)
9. ✅ **Check documentation** for specific errors
10. ✅ **Seek help** (GitHub Issues, Discord)

### Quick Recovery Commands:

```bash
# Restart everything
npm run db:stop && npm run db:start && npm start

# Clean reinstall
rm -rf node_modules && npm install && npm run build

# Reset database
npm run db:reset

# Full reset
./nuclear-reset.sh  # WARNING: deletes all data
```

---

## Getting Help

### Where to Get Support:

1. **GitHub Issues**: https://github.com/tapas100/flexgate-proxy/issues
2. **Documentation**: `/docs-site/` folder
3. **Discord**: (community link)
4. **Stack Overflow**: Tag `flexgate`

### Information to Include:

When reporting issues:
- OS and version
- Node.js version (`node -v`)
- npm version (`npm -v`)
- Podman/Docker version
- Full error logs
- Steps to reproduce
- What you've tried

---

All troubleshooting scripts are included in the repository! 🛠️
