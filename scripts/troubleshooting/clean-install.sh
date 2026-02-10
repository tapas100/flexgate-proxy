#!/bin/bash
# clean-install.sh - Complete clean installation of FlexGate

echo "🧹 Starting clean FlexGate installation..."
echo ""

# 1. Stop all services
echo "📛 Step 1/10: Stopping services..."
pkill -f "node.*app.ts" 2>/dev/null || true
pkill -f "node.*dist/app.js" 2>/dev/null || true

if command -v podman &> /dev/null; then
    podman-compose -f podman-compose.yml down 2>/dev/null || true
    podman-compose -f podman-compose.dev.yml down 2>/dev/null || true
elif command -v docker &> /dev/null; then
    docker-compose -f podman-compose.yml down 2>/dev/null || true
    docker-compose -f podman-compose.dev.yml down 2>/dev/null || true
fi

# 2. Remove containers (keep volumes for data preservation)
echo "🗑️  Step 2/10: Removing old containers..."
if command -v podman &> /dev/null; then
    podman rm -f $(podman ps -aq --filter "name=flexgate") 2>/dev/null || true
elif command -v docker &> /dev/null; then
    docker rm -f $(docker ps -aq --filter "name=flexgate") 2>/dev/null || true
fi

# 3. Remove node_modules
echo "🗑️  Step 3/10: Cleaning dependencies..."
rm -rf node_modules
rm -rf admin-ui/node_modules
rm -rf package-lock.json
rm -rf admin-ui/package-lock.json

# 4. Clean build artifacts
echo "🗑️  Step 4/10: Cleaning build artifacts..."
rm -rf dist
rm -rf admin-ui/build
rm -rf admin-ui/.cache

# 5. Clean npm cache
echo "🧼 Step 5/10: Cleaning npm cache..."
npm cache clean --force

# 6. Reinstall root dependencies
echo "📦 Step 6/10: Installing root dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install root dependencies"
    exit 1
fi

# 7. Reinstall Admin UI dependencies
echo "📦 Step 7/10: Installing Admin UI dependencies..."
cd admin-ui
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install Admin UI dependencies"
    exit 1
fi
cd ..

# 8. Build FlexGate
echo "🔨 Step 8/10: Building FlexGate..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Failed to build FlexGate"
    exit 1
fi

# 9. Build Admin UI
echo "🔨 Step 9/10: Building Admin UI..."
cd admin-ui
npm run build

if [ $? -ne 0 ]; then
    echo "⚠️  Failed to build Admin UI (continuing anyway)"
fi
cd ..

# 10. Start database services
echo "🚀 Step 10/10: Starting database services..."
if command -v podman &> /dev/null; then
    podman-compose -f podman-compose.dev.yml up -d postgres redis
elif command -v docker &> /dev/null; then
    docker-compose -f podman-compose.dev.yml up -d postgres redis
else
    echo "⚠️  No container runtime found, skipping database start"
fi

# Wait for database to be ready
if command -v podman &> /dev/null || command -v docker &> /dev/null; then
    echo "⏳ Waiting for database to be ready..."
    sleep 5

    # Run migrations
    echo "🗄️  Running database migrations..."
    npm run db:migrate

    if [ $? -ne 0 ]; then
        echo "⚠️  Migrations failed (database might not be ready yet)"
    fi
fi

echo ""
echo "✅ Clean installation complete!"
echo ""
echo "Next steps:"
echo "  1. Start FlexGate:  npm start"
echo "  2. Start Admin UI:  cd admin-ui && npm start"
echo "  3. Check health:    ./scripts/troubleshooting/health-check.sh"
echo ""
echo "URLs:"
echo "  FlexGate API:  http://localhost:3000"
echo "  Admin UI:      http://localhost:3001"
echo "  Health check:  http://localhost:3000/health"
