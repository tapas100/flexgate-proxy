#!/bin/bash
# check-requirements.sh - Pre-installation system requirements check

echo "🔍 Checking FlexGate Requirements..."
echo ""

EXIT_CODE=0

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    echo "✅ Node.js installed: $NODE_VERSION"
    
    # Check if version >= 16
    MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'v' -f2 | cut -d'.' -f1)
    if [ $MAJOR_VERSION -lt 16 ]; then
        echo "❌ Node.js version must be >= 16.x"
        EXIT_CODE=1
    fi
else
    echo "❌ Node.js not installed"
    echo "   Install from: https://nodejs.org/"
    EXIT_CODE=1
fi

# Check npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm -v)
    echo "✅ npm installed: $NPM_VERSION"
else
    echo "❌ npm not installed"
    EXIT_CODE=1
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
if [[ "$OSTYPE" == "darwin"* ]]; then
    AVAILABLE_SPACE=$(df -h . | awk 'NR==2 {print $4}')
elif [[ "$OSTYPE" == "linux"* ]]; then
    AVAILABLE_SPACE=$(df -h . | awk 'NR==2 {print $4}')
fi
echo "Available disk space: $AVAILABLE_SPACE"

# Check memory
echo ""
echo "🔍 Checking available memory..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    MEMORY=$(sysctl hw.memsize 2>/dev/null | awk '{print $2/1024/1024/1024 " GB"}')
    echo "Total memory: $MEMORY"
elif [[ "$OSTYPE" == "linux"* ]]; then
    MEMORY=$(free -h 2>/dev/null | awk '/^Mem:/ {print $2}')
    echo "Total memory: $MEMORY"
fi

echo ""
if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ Pre-installation checks complete!"
else
    echo "❌ Some requirements not met. Please fix the issues above."
fi

exit $EXIT_CODE
