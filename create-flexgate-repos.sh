#!/bin/bash
# ============================================
# FlexGate Multi-Repository Creator
# ============================================
# Creates all FlexGate repositories in tapas100's GitHub
# Usage: ./create-flexgate-repos.sh
# ============================================

set -e

echo "🚀 FlexGate Multi-Repository Setup"
echo "===================================="
echo ""

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) not found"
    echo "Install with: brew install gh"
    echo "Then run: gh auth login"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo "❌ Not authenticated with GitHub"
    echo "Run: gh auth login"
    exit 1
fi

echo "✅ GitHub CLI authenticated"
echo ""

# Ask for confirmation
read -p "⚠️  This will create 5 new repositories in tapas100. Continue? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Cancelled"
    exit 0
fi

echo ""
echo "📦 Creating repositories..."
echo ""

# ============================================
# 1. Admin UI Repository
# ============================================
echo "1️⃣  Creating flexgate-admin..."
gh repo create tapas100/flexgate-admin \
  --public \
  --description "FlexGate Admin Dashboard - Modern React UI for API Gateway Management" \
  --gitignore Node \
  --license mit \
  --add-readme || echo "⚠️  Repo may already exist"

# Add topics
gh repo edit tapas100/flexgate-admin \
  --add-topic react \
  --add-topic typescript \
  --add-topic dashboard \
  --add-topic admin-ui \
  --add-topic flexgate || true

echo "✅ flexgate-admin created"
echo ""

# ============================================
# 2. Documentation Repository
# ============================================
echo "2️⃣  Creating flexgate-docs..."
gh repo create tapas100/flexgate-docs \
  --public \
  --description "FlexGate Documentation - Guides, API docs, and tutorials" \
  --license mit \
  --add-readme || echo "⚠️  Repo may already exist"

gh repo edit tapas100/flexgate-docs \
  --add-topic documentation \
  --add-topic docusaurus \
  --add-topic guides \
  --add-topic api-documentation \
  --add-topic flexgate || true

echo "✅ flexgate-docs created"
echo ""

# ============================================
# 3. Edge Agent Repository
# ============================================
echo "3️⃣  Creating flexgate-agent..."
gh repo create tapas100/flexgate-agent \
  --public \
  --description "FlexGate Edge Agent - Lightweight proxy agent for distributed deployments" \
  --gitignore Go \
  --license mit \
  --add-readme || echo "⚠️  Repo may already exist"

gh repo edit tapas100/flexgate-agent \
  --add-topic golang \
  --add-topic edge-computing \
  --add-topic distributed-systems \
  --add-topic proxy \
  --add-topic flexgate || true

echo "✅ flexgate-agent created"
echo ""

# ============================================
# 4. AI Services Repository
# ============================================
echo "4️⃣  Creating flexgate-ai..."
gh repo create tapas100/flexgate-ai \
  --public \
  --description "FlexGate AI Services - Machine learning features for intelligent routing and traffic analysis" \
  --gitignore Python \
  --license mit \
  --add-readme || echo "⚠️  Repo may already exist"

gh repo edit tapas100/flexgate-ai \
  --add-topic python \
  --add-topic machine-learning \
  --add-topic ai \
  --add-topic fastapi \
  --add-topic flexgate || true

echo "✅ flexgate-ai created"
echo ""

# ============================================
# 5. Marketplace Repository
# ============================================
echo "5️⃣  Creating flexgate-marketplace..."
gh repo create tapas100/flexgate-marketplace \
  --public \
  --description "FlexGate Marketplace Integrations - One-click deployments to cloud marketplaces" \
  --license mit \
  --add-readme || echo "⚠️  Repo may already exist"

gh repo edit tapas100/flexgate-marketplace \
  --add-topic marketplace \
  --add-topic cloud-deployment \
  --add-topic infrastructure \
  --add-topic digitalocean \
  --add-topic aws \
  --add-topic flexgate || true

echo "✅ flexgate-marketplace created"
echo ""

# ============================================
# Summary
# ============================================
echo ""
echo "🎉 All repositories created successfully!"
echo ""
echo "📁 Your FlexGate repositories:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ https://github.com/tapas100/flexgate-proxy (main - already exists)"
echo "✅ https://github.com/tapas100/flexgate-admin"
echo "✅ https://github.com/tapas100/flexgate-docs"
echo "✅ https://github.com/tapas100/flexgate-agent"
echo "✅ https://github.com/tapas100/flexgate-ai"
echo "✅ https://github.com/tapas100/flexgate-marketplace"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📝 Next steps:"
echo "1. Clone repositories: gh repo clone tapas100/flexgate-admin"
echo "2. See MULTI_REPO_SETUP_GUIDE.md for setup instructions"
echo "3. Start with flexgate-proxy (monorepo) for Phase 2"
echo ""
echo "🚀 Happy coding!"
