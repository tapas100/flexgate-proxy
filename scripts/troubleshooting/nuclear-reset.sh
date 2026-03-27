#!/bin/bash
# nuclear-reset.sh - Complete reset of FlexGate (WARNING: DESTROYS ALL DATA)

echo "☢️  NUCLEAR RESET - TOTAL FLEXGATE WIPE"
echo "========================================"
echo ""
echo "⚠️  WARNING: This will:"
echo "   - Stop all FlexGate services"
echo "   - Delete ALL containers"
echo "   - Delete ALL volumes (DATABASE DATA WILL BE LOST)"
echo "   - Delete all node_modules"
echo "   - Delete all build artifacts"
echo "   - Delete all logs"
echo ""

read -p "Are you ABSOLUTELY sure? Type 'DELETE EVERYTHING' to continue: " confirm

if [ "$confirm" != "DELETE EVERYTHING" ]; then
    echo "❌ Cancelled. Nothing was deleted."
    exit 0
fi

echo ""
echo "🚨 Starting nuclear reset in 5 seconds..."
echo "Press Ctrl+C to abort!"
sleep 5

# Determine container runtime
RUNTIME=""
if command -v podman &> /dev/null; then
    RUNTIME="podman"
elif command -v docker &> /dev/null; then
    RUNTIME="docker"
fi

# 1. Stop all Node.js processes
echo ""
echo "1️⃣  Stopping all Node.js processes..."
pkill -f "node.*flexgate" 2>/dev/null || true
pkill -f "node.*app.ts" 2>/dev/null || true
pkill -f "npm.*start" 2>/dev/null || true

# 2. Stop and remove all FlexGate containers
if [ -n "$RUNTIME" ]; then
    echo ""
    echo "2️⃣  Stopping and removing all FlexGate containers..."
    
    # Get all flexgate containers
    CONTAINERS=$($RUNTIME ps -aq --filter "name=flexgate" 2>/dev/null)
    
    if [ -n "$CONTAINERS" ]; then
        echo "   Found containers: $(echo $CONTAINERS | wc -w)"
        $RUNTIME stop $CONTAINERS 2>/dev/null || true
        $RUNTIME rm -f $CONTAINERS 2>/dev/null || true
    else
        echo "   No containers found"
    fi
fi

# 3. Remove all volumes (DATA LOSS!)
if [ -n "$RUNTIME" ]; then
    echo ""
    echo "3️⃣  Removing all FlexGate volumes (DATA WILL BE LOST)..."
    
    VOLUMES=$($RUNTIME volume ls -q --filter "name=flexgate" 2>/dev/null)
    
    if [ -n "$VOLUMES" ]; then
        echo "   Found volumes: $(echo $VOLUMES | wc -w)"
        $RUNTIME volume rm -f $VOLUMES 2>/dev/null || true
    else
        echo "   No volumes found"
    fi
fi

# 4. Remove all node_modules
echo ""
echo "4️⃣  Removing all node_modules..."
find . -name "node_modules" -type d -prune -exec rm -rf {} \; 2>/dev/null

# 5. Remove lock files
echo ""
echo "5️⃣  Removing lock files..."
find . -name "package-lock.json" -type f -delete 2>/dev/null
find . -name "yarn.lock" -type f -delete 2>/dev/null

# 6. Remove build artifacts
echo ""
echo "6️⃣  Removing build artifacts..."
rm -rf dist
rm -rf admin-ui/build
rm -rf admin-ui/.cache
rm -rf .next
rm -rf coverage

# 7. Remove logs
echo ""
echo "7️⃣  Removing logs..."
rm -rf logs/*.log
rm -rf server.log

# 8. Clean npm cache
echo ""
echo "8️⃣  Cleaning npm cache..."
npm cache clean --force

# 9. Remove any stray .env files (optional - commented out for safety)
# echo ""
# echo "9️⃣  Removing .env files..."
# rm -f .env .env.local .env.development .env.production

echo ""
echo "☢️  NUCLEAR RESET COMPLETE!"
echo ""
echo "Everything has been wiped. You now have a clean slate."
echo ""
echo "To reinstall FlexGate:"
echo "  1. npm install"
echo "  2. npm run build"
echo "  3. npm run db:start"
echo "  4. npm run db:migrate"
echo "  5. npm start"
echo ""
echo "Or use the clean install script:"
echo "  ./scripts/troubleshooting/clean-install.sh"
