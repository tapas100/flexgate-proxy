#!/bin/bash
set -e

cd /Users/tamahant/Documents/GitHub/flexgate-proxy

echo "=========================================="
echo "Git Author Rewrite - FINAL PASS"
echo "=========================================="
echo ""

# Remove any existing backup refs
echo "Cleaning old backup refs..."
git for-each-ref --format="%(refname)" refs/original/ | xargs -n 1 git update-ref -d 2>/dev/null || true

echo "Running comprehensive rewrite..."
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f --env-filter '
CORRECT_NAME="tapas100"
CORRECT_EMAIL="mahanta.tapas9@gmail.com"

# Match ANY variation of the old authors
export GIT_AUTHOR_NAME="$CORRECT_NAME"
export GIT_AUTHOR_EMAIL="$CORRECT_EMAIL"
export GIT_COMMITTER_NAME="$CORRECT_NAME"
export GIT_COMMITTER_EMAIL="$CORRECT_EMAIL"

' --tag-name-filter cat -- --all

echo ""
echo "=========================================="
echo "✓ Final rewrite complete!"
echo "=========================================="
echo ""
echo "Verification:"
git log --all --format="%an <%ae>" | sort | uniq -c
echo ""
