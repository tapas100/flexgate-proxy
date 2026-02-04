#!/bin/bash
#
# Git Author Rewrite Script
# This script rewrites all commits to change author information
# WARNING: This rewrites Git history!
#

cd /Users/tamahant/Documents/GitHub/flexgate-proxy

echo "=========================================="
echo "Git Author Rewrite Script"
echo "=========================================="
echo ""
echo "This will rewrite ALL commits across ALL branches to:"
echo "  Author: tapas100 <mahanta.tapas9@gmail.com>"
echo ""
echo "WARNING: This rewrites Git history!"
echo "You will need to force push all branches after this."
echo ""
read -p "Continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Aborted."
    exit 1
fi

echo ""
echo "Starting Git history rewrite..."
echo ""

# Use git filter-branch to rewrite all commits
git filter-branch --env-filter '

# New author information
CORRECT_NAME="tapas100"
CORRECT_EMAIL="mahanta.tapas9@gmail.com"

# Rewrite all Cisco emails
if [ "$GIT_COMMITTER_EMAIL" = "tamahant+cisco@cisco.com" ] || \
   [ "$GIT_COMMITTER_EMAIL" = "tamahant@cisco.com" ] || \
   [ "$GIT_AUTHOR_EMAIL" = "tamahant+cisco@cisco.com" ] || \
   [ "$GIT_AUTHOR_EMAIL" = "tamahant@cisco.com" ]; then
    export GIT_COMMITTER_NAME="$CORRECT_NAME"
    export GIT_COMMITTER_EMAIL="$CORRECT_EMAIL"
    export GIT_AUTHOR_NAME="$CORRECT_NAME"
    export GIT_AUTHOR_EMAIL="$CORRECT_EMAIL"
fi

# Also fix any commits with "Tapas Mahanta" name but wrong email
if [ "$GIT_AUTHOR_NAME" = "Tapas Mahanta" ] && \
   [ "$GIT_AUTHOR_EMAIL" != "mahanta.tapas9@gmail.com" ]; then
    export GIT_COMMITTER_NAME="$CORRECT_NAME"
    export GIT_COMMITTER_EMAIL="$CORRECT_EMAIL"
    export GIT_AUTHOR_NAME="$CORRECT_NAME"
    export GIT_AUTHOR_EMAIL="$CORRECT_EMAIL"
fi

# Also fix the -X format
if [[ "$GIT_AUTHOR_NAME" == *"tamahant"* ]]; then
    export GIT_COMMITTER_NAME="$CORRECT_NAME"
    export GIT_COMMITTER_EMAIL="$CORRECT_EMAIL"
    export GIT_AUTHOR_NAME="$CORRECT_NAME"
    export GIT_AUTHOR_EMAIL="$CORRECT_EMAIL"
fi

' --tag-name-filter cat -- --branches --tags

echo ""
echo "=========================================="
echo "Git history rewrite complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Verify the changes: git log --format='%an <%ae>' | sort | uniq"
echo "2. Force push ALL branches:"
echo "   git push --force --all origin"
echo "   git push --force --tags origin"
echo ""
echo "IMPORTANT: All collaborators will need to re-clone the repository!"
echo ""
