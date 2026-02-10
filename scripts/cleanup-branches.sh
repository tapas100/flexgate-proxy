#!/bin/bash
# ============================================
# FlexGate - Branch Cleanup Script
# ============================================
# Deletes empty placeholder branches that were
# created during planning but never implemented
# ============================================

set -e

echo "🧹 FlexGate Branch Cleanup"
echo "=========================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Branches to keep (active work)
KEEP_BRANCHES=(
  "main"
  "dev"
  "feature/admin-ui-foundation"
  "feature/metrics-system"
  "feature/core-stabilization"
)

# Empty placeholder branches to delete
DELETE_BRANCHES=(
  "feature/agent-orchestrator"
  "feature/ai-services"
  "feature/alert-management"
  "feature/architecture-split"
  "feature/communication-ui"
  "feature/config-editor-ui"
  "feature/config-ux"
  "feature/control-plane-api"
  "feature/flexgate-agent"
  "feature/health-dashboard"
  "feature/incidents-ui"
  "feature/integrations"
  "feature/llm-infrastructure"
  "feature/logging-system"
  "feature/message-ux"
  "feature/oss-strategy"
  "feature/pre-aggregation"
  "feature/prompt-architecture"
  "feature/tenant-config"
)

echo "Branches to keep:"
for branch in "${KEEP_BRANCHES[@]}"; do
  echo -e "  ${GREEN}✓${NC} $branch"
done

echo ""
echo "Empty branches to delete:"
for branch in "${DELETE_BRANCHES[@]}"; do
  echo -e "  ${RED}✗${NC} $branch"
done

echo ""
echo -e "${YELLOW}⚠️  This will delete ${#DELETE_BRANCHES[@]} branches locally.${NC}"
echo ""
read -p "Continue? (y/N): " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ Cancelled"
  exit 1
fi

echo ""
echo "🗑️  Deleting empty branches..."

deleted=0
failed=0

for branch in "${DELETE_BRANCHES[@]}"; do
  if git show-ref --verify --quiet "refs/heads/$branch"; then
    if git branch -D "$branch" 2>/dev/null; then
      echo -e "${GREEN}✓${NC} Deleted: $branch"
      ((deleted++))
    else
      echo -e "${RED}✗${NC} Failed: $branch"
      ((failed++))
    fi
  else
    echo -e "${YELLOW}⊘${NC} Not found: $branch (already deleted?)"
  fi
done

echo ""
echo "📊 Summary:"
echo "  Deleted: $deleted branches"
echo "  Failed: $failed branches"
echo ""

if [ $deleted -gt 0 ]; then
  echo -e "${GREEN}✅ Cleanup complete!${NC}"
  echo ""
  echo "Remaining branches:"
  git branch
  echo ""
  echo "💡 Note: Remote branches (origin/*) were not deleted."
  echo "   If you want to delete remote branches too, run:"
  echo ""
  for branch in "${DELETE_BRANCHES[@]}"; do
    echo "   git push origin --delete $branch"
  done
else
  echo -e "${YELLOW}⚠️  No branches were deleted${NC}"
fi
