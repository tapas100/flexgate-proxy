#!/bin/bash
set -e

cd /Users/tamahant/Documents/GitHub/flexgate-proxy

echo "=========================================="
echo "Git Author Rewrite - Automated"
echo "=========================================="
echo ""
echo "Rewriting all commits to:"
echo "  Author: tapas100 <mahanta.tapas9@gmail.com>"
echo ""

# Backup current state
echo "Creating backup..."
BACKUP_BRANCH="backup-before-rewrite-$(date +%Y%m%d-%H%M%S)"
git branch "$BACKUP_BRANCH"
echo "✓ Backup created: $BACKUP_BRANCH"
echo ""

echo "Rewriting commit history..."
git filter-branch -f --env-filter '
CORRECT_NAME="tapas100"
CORRECT_EMAIL="mahanta.tapas9@gmail.com"

# Rewrite if any of these conditions match
if [ "$GIT_COMMITTER_EMAIL" = "tamahant+cisco@cisco.com" ] || \
   [ "$GIT_COMMITTER_EMAIL" = "tamahant@cisco.com" ] || \
   [ "$GIT_AUTHOR_EMAIL" = "tamahant+cisco@cisco.com" ] || \
   [ "$GIT_AUTHOR_EMAIL" = "tamahant@cisco.com" ] || \
   [[ "$GIT_AUTHOR_NAME" == *"tamahant"* ]] || \
   [[ "$GIT_COMMITTER_NAME" == *"tamahant"* ]] || \
   ( [ "$GIT_AUTHOR_NAME" = "Tapas Mahanta" ] && [ "$GIT_AUTHOR_EMAIL" != "mahanta.tapas9@gmail.com" ] ); then
    export GIT_COMMITTER_NAME="$CORRECT_NAME"
    export GIT_COMMITTER_EMAIL="$CORRECT_EMAIL"
    export GIT_AUTHOR_NAME="$CORRECT_NAME"
    export GIT_AUTHOR_EMAIL="$CORRECT_EMAIL"
fi
' --tag-name-filter cat -- --branches --tags

echo ""
echo "=========================================="
echo "✓ Rewrite complete!"
echo "=========================================="
echo ""
echo "Verifying changes..."
git log --all --format="%an <%ae>" | sort | uniq -c
echo ""
echo "Backup branch: $BACKUP_BRANCH"
echo ""
echo "Next steps:"
echo "1. Review the changes above"
echo "2. If everything looks good, run:"
echo "   git push --force --all origin"
echo "   git push --force --tags origin"
echo ""
