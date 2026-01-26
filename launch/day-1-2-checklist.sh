#!/bin/bash
# FlexGate Launch Checklist - Day 1-2

echo "🚀 FlexGate Launch Preparation"
echo "=============================="
echo ""

# Step 1: Check domain availability
echo "📍 Step 1: Register Domain"
echo "Visit: https://www.namecheap.com/domains/registration/results/?domain=flexgate.dev"
echo "Cost: ~$12/year"
echo ""
read -p "✓ Domain registered? (y/n): " domain_done

# Step 2: Create social accounts
echo ""
echo "📍 Step 2: Create Social Accounts"
echo "- Twitter: twitter.com/signup (username: @FlexGateDev)"
echo "- LinkedIn: linkedin.com/company/setup/new/"
echo "- Dev.to: dev.to/enter (username: flexgate)"
echo ""
read -p "✓ Accounts created? (y/n): " social_done

# Step 3: Set up analytics
echo ""
echo "📍 Step 3: Set Up Analytics"
echo "- Google Analytics: analytics.google.com"
echo "- GitHub: Enable 'Insights' → 'Traffic'"
echo ""
read -p "✓ Analytics ready? (y/n): " analytics_done

# Step 4: Update repo
echo ""
echo "📍 Step 4: Update Repository"
echo "Run these commands:"
echo ""
echo "  # Rename repo on GitHub first, then:"
echo "  git remote set-url origin https://github.com/tapas100/flexgate-proxy.git"
echo "  git add ."
echo "  git commit -m 'feat: rebrand as FlexGate product'"
echo "  git push origin main"
echo ""
read -p "✓ Repo updated? (y/n): " repo_done

echo ""
if [[ "$domain_done" == "y" && "$social_done" == "y" && "$analytics_done" == "y" && "$repo_done" == "y" ]]; then
    echo "🎉 Day 1-2 Complete! Ready for Day 3."
else
    echo "⚠️  Complete all steps before proceeding."
fi
