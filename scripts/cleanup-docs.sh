#!/bin/bash

# Documentation Cleanup Script
# Date: February 10, 2026
# Purpose: Organize permanent docs, remove temporary session files

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🧹 FlexGate Documentation Cleanup"
echo "=================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Phase 1: Move permanent docs to docs/
echo "📁 Phase 1: Moving permanent documentation to docs/"
echo "---------------------------------------------------"

# Create docs structure
echo "Creating docs directory structure..."
mkdir -p docs/architecture
mkdir -p docs/deployment
mkdir -p docs/cli

# Move architecture docs
if [ -f "ARCHITECTURE_OVERVIEW.md" ]; then
    echo "  ✓ Moving ARCHITECTURE_OVERVIEW.md -> docs/architecture/overview.md"
    mv ARCHITECTURE_OVERVIEW.md docs/architecture/overview.md
fi

# Move deployment docs
if [ -f "EC2_DEPLOYMENT_GUIDE.md" ]; then
    echo "  ✓ Moving EC2_DEPLOYMENT_GUIDE.md -> docs/deployment/aws-ec2.md"
    mv EC2_DEPLOYMENT_GUIDE.md docs/deployment/aws-ec2.md
fi

if [ -f "QUICK_DEPLOY.md" ]; then
    echo "  ✓ Moving QUICK_DEPLOY.md -> docs/deployment/quick-start.md"
    mv QUICK_DEPLOY.md docs/deployment/quick-start.md
fi

if [ -f "scripts/deployment/CLOUD_COMPARISON.md" ]; then
    echo "  ✓ Moving scripts/deployment/CLOUD_COMPARISON.md -> docs/deployment/cloud-comparison.md"
    mv scripts/deployment/CLOUD_COMPARISON.md docs/deployment/cloud-comparison.md
fi

if [ -f "scripts/deployment/DEPLOYMENT_SUMMARY.md" ]; then
    echo "  ✓ Moving scripts/deployment/DEPLOYMENT_SUMMARY.md -> docs/deployment/summary.md"
    mv scripts/deployment/DEPLOYMENT_SUMMARY.md docs/deployment/summary.md
fi

# Move CLI docs
if [ -f "CLI_README.md" ]; then
    echo "  ✓ Moving CLI_README.md -> docs/cli/README.md"
    mv CLI_README.md docs/cli/README.md
fi

echo ""
echo -e "${GREEN}✓ Phase 1 complete: 6 files moved to docs/${NC}"
echo ""

# Phase 2: Remove temporary/session files
echo "🗑️  Phase 2: Removing temporary and session files"
echo "------------------------------------------------"

REMOVED_COUNT=0

# Admin UI session docs (5 files)
echo "Removing Admin UI session docs..."
for file in ADMIN_UI_QUICK_REFERENCE.md ADMIN_UI_STARTUP_GUIDE.md TROUBLESHOOTING_ADMIN_UI.md TROUBLESHOOTING_UI_SUMMARY.md admin-ui/SETTINGS_IMPLEMENTATION.md; do
    if [ -f "$file" ]; then
        echo "  ✗ $file"
        rm "$file"
        ((REMOVED_COUNT++))
    fi
done

# Container cleanup
if [ -f "CLEANUP_SUMMARY.md" ]; then
    echo "  ✗ CLEANUP_SUMMARY.md"
    rm CLEANUP_SUMMARY.md
    ((REMOVED_COUNT++))
fi

# CLI redundant docs (5 files)
echo "Removing redundant CLI docs..."
for file in CLI_IMPLEMENTATION_SUMMARY.md CLI_JSON_CONFIGURATION_GUIDE.md CLI_QUICK_REFERENCE.md COMPLETE_CONFIGURATION_SYSTEM.md CONFIG_LOADER_TESTING.md; do
    if [ -f "$file" ]; then
        echo "  ✗ $file"
        rm "$file"
        ((REMOVED_COUNT++))
    fi
done

# Installation session docs (5 files)
echo "Removing installation session docs..."
for file in INSTALLATION_FAILURE_COMPLETE_SUMMARY.md INSTALLATION_FAILURE_MANAGEMENT.md INSTALLATION_FAILURE_VISUAL_GUIDE.md DEVELOPER_SETUP_SUMMARY.md SETUP_VISUAL_GUIDE.md; do
    if [ -f "$file" ]; then
        echo "  ✗ $file"
        rm "$file"
        ((REMOVED_COUNT++))
    fi
done

# Test/debug sessions (3 files)
echo "Removing test/debug session docs..."
for file in TEST_RESULTS.md HAPROXY_FIX.md TROUBLESHOOTING_QUICK_REF.md; do
    if [ -f "$file" ]; then
        echo "  ✗ $file"
        rm "$file"
        ((REMOVED_COUNT++))
    fi
done

# Redundant/index files (4 files)
echo "Removing redundant/index files..."
for file in VISUAL_ARCHITECTURE.md DEPLOYMENT_CONFIGURATION_INDEX.md COMPLETE_PICTURE.md MANAGEMENT_SCRIPTS.md; do
    if [ -f "$file" ]; then
        echo "  ✗ $file"
        rm "$file"
        ((REMOVED_COUNT++))
    fi
done

echo ""
echo -e "${GREEN}✓ Phase 2 complete: $REMOVED_COUNT files removed${NC}"
echo ""

# Phase 3: Create docs index
echo "📝 Phase 3: Creating documentation index"
echo "---------------------------------------"

cat > docs/README.md << 'EOF'
# FlexGate Documentation

Welcome to the FlexGate documentation!

## 📚 Documentation Structure

### Architecture
- [Overview](architecture/overview.md) - System architecture, HAProxy vs Nginx, request flows

### Deployment
- [Quick Start](deployment/quick-start.md) - Fast deployment guide
- [AWS EC2](deployment/aws-ec2.md) - Deploy to Amazon EC2
- [Cloud Comparison](deployment/cloud-comparison.md) - Compare cloud providers
- [Summary](deployment/summary.md) - Deployment options overview

### CLI
- [CLI Documentation](cli/README.md) - Command-line interface guide

### API
- [API Reference](api.md) - REST API documentation

### Development
- [Getting Started](../QUICKSTART.md) - Quick start for developers
- [Testing Guide](../TESTING_GUIDE.md) - How to test FlexGate
- [Contributing](../CONTRIBUTING.md) - Contribution guidelines

## 🚀 Quick Links

- [Main README](../README.md)
- [Product Features](../FEATURES.md)
- [Roadmap](../ROADMAP.md)
- [AI-Native Roadmap](../AI_NATIVE_ROADMAP.md)
- [Security](../SECURITY.md)

## 📖 Additional Resources

- [Architecture Diagrams](architecture/)
- [Integration Guides](integration/)
- [Testing Documentation](testing/)
EOF

echo "  ✓ Created docs/README.md"
echo ""
echo -e "${GREEN}✓ Phase 3 complete: Documentation index created${NC}"
echo ""

# Summary
echo "📊 Summary"
echo "=========="
echo ""
echo "  Moved to docs/:     6 files"
echo "  Removed:           $REMOVED_COUNT files"
echo "  Documentation organized and cleaned up!"
echo ""
echo -e "${YELLOW}Next step: Review changes and commit${NC}"
echo ""
echo "  git status"
echo "  git add docs/"
echo "  git add -u  # Stage deletions"
echo "  git commit -m 'docs: Reorganize and cleanup documentation'"
echo ""
