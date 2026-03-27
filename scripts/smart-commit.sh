#!/bin/bash

# Smart Commit Strategy for FlexGate
# Commits files in logical groups

set -e

cd "$(dirname "$0")/.."

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "🚀 FlexGate Smart Commit Strategy"
echo "=================================="
echo ""

# Commit 1: Configuration System
echo "📦 Commit 1: Configuration System"
git add src/config/ config/ 2>/dev/null || true
if git diff --cached --quiet; then
    echo "  ⊘ No changes"
else
    git commit -m "feat: Add JSON configuration system with schema validation

- Add JSON config loader with environment support
- Include schema validation for configuration
- Provide example configs for dev/prod environments
- Support for flexgate.json configuration file
"
    echo -e "  ${GREEN}✓ Committed${NC}"
fi
echo ""

# Commit 2: CLI Tool
echo "🔧 Commit 2: CLI Tool"
git add bin/flexgate-cli.js 2>/dev/null || true
if git diff --cached --quiet; then
    echo "  ⊘ No changes"
else
    git commit -m "feat: Add command-line interface (CLI) tool

- Implement flexgate-cli.js for command-line management
- Support health checks, config validation, status monitoring
- Enable local development and production operations
"
    echo -e "  ${GREEN}✓ Committed${NC}"
fi
echo ""

# Commit 3: Management Scripts
echo "⚙️  Commit 3: Management Scripts"
git add scripts/start-all.sh scripts/stop-all.sh scripts/restart-all.sh scripts/status.sh 2>/dev/null || true
if git diff --cached --quiet; then
    echo "  ⊘ No changes"
else
    git commit -m "feat: Add service management scripts

- start-all.sh: Start FlexGate and dependencies
- stop-all.sh: Gracefully stop services
- restart-all.sh: Restart with zero-downtime
- status.sh: Health check and status monitoring
- PID-based process management
- Color-coded output for better UX
"
    echo -e "  ${GREEN}✓ Committed${NC}"
fi
echo ""

# Commit 4: Deployment Scripts
echo "☁️  Commit 4: Deployment Scripts"
git add scripts/deployment/ 2>/dev/null || true
if git diff --cached --quiet; then
    echo "  ⊘ No changes"
else
    git commit -m "feat: Add multi-cloud deployment scripts

- AWS EC2 deployment script
- Google Cloud Platform (GCP) deployment
- DigitalOcean deployment
- Cloud provider comparison documentation
- Automated setup and configuration
"
    echo -e "  ${GREEN}✓ Committed${NC}"
fi
echo ""

# Commit 5: Troubleshooting Feature
echo "🔍 Commit 5: Troubleshooting Feature"
git add routes/troubleshooting.ts admin-ui/src/pages/Troubleshooting.tsx admin-ui/src/components/Settings/ 2>/dev/null || true
if git diff --cached --quiet; then
    echo "  ⊘ No changes"
else
    git commit -m "feat: Add troubleshooting API and UI

- Troubleshooting REST API endpoint
- Admin UI troubleshooting page
- Settings components for configuration
- Interactive debugging interface
"
    echo -e "  ${GREEN}✓ Committed${NC}"
fi
echo ""

# Commit 6: Documentation
echo "📚 Commit 6: Documentation"
git add docs-site/ docs/admin-ui/ docs/getting-started/ scripts/docs/ scripts/troubleshooting/ 2>/dev/null || true
if git diff --cached --quiet; then
    echo "  ⊘ No changes"
else
    git commit -m "docs: Add comprehensive documentation

- VitePress documentation site setup
- Admin UI overview documentation
- Getting started quickstart guide
- Architecture documentation
- Troubleshooting guides
"
    echo -e "  ${GREEN}✓ Committed${NC}"
fi
echo ""

# Commit 7: Application Updates
echo "🔄 Commit 7: Application Updates"
git add README.md package.json package-lock.json app.ts bin/www.ts 2>/dev/null || true
git add admin-ui/src/App.tsx admin-ui/src/components/Layout/Sidebar.tsx admin-ui/src/pages/Settings.tsx 2>/dev/null || true
git add src/database/repositories/webhookDeliveriesRepository.ts src/routes/stream.js 2>/dev/null || true
if git diff --cached --quiet; then
    echo "  ⊘ No changes"
else
    git commit -m "chore: Update application core files

- Update package dependencies
- Refactor application initialization
- Update Admin UI components
- Database repository improvements
- Stream route enhancements
"
    echo -e "  ${GREEN}✓ Committed${NC}"
fi
echo ""

# Commit 8: Container Configuration
echo "🐳 Commit 8: Container Configuration"
git add Containerfile podman-compose.yml haproxy/haproxy.cfg scripts/cleanup-branches.sh 2>/dev/null || true
if git diff --cached --quiet; then
    echo "  ⊘ No changes"
else
    git commit -m "chore: Update container and infrastructure configuration

- Update Containerfile for optimized builds
- Refine podman-compose.yml services
- HAProxy configuration improvements
- Branch cleanup automation
"
    echo -e "  ${GREEN}✓ Committed${NC}"
fi
echo ""

# Commit 9: Cleanup
echo "🧹 Commit 9: Cleanup"
git add -u 2>/dev/null || true  # Stage deletions
if git diff --cached --quiet; then
    echo "  ⊘ No changes"
else
    git commit -m "chore: Remove obsolete and temporary files

- Remove deprecated HAProxy config generator
- Clean up obsolete source files
"
    echo -e "  ${GREEN}✓ Committed${NC}"
fi
echo ""

# Commit 10: Cleanup summary
echo "📝 Commit 10: Session Summary"
git add CLEANUP_COMPLETE.md UNCOMMITTED_FILES_ANALYSIS.md 2>/dev/null || true
if git diff --cached --quiet; then
    echo "  ⊘ No changes"
else
    git commit -m "docs: Add session documentation summaries

- Documentation cleanup completion summary
- Uncommitted files analysis
"
    echo -e "  ${GREEN}✓ Committed${NC}"
fi
echo ""

# Summary
echo "✅ Smart Commit Complete!"
echo ""
echo "Run: git log --oneline -10"
echo "To see your commits"
echo ""
