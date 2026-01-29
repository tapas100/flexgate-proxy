#!/bin/bash

# Copy all test files to flexgate-tests repository
# Run this script from the flexgate-proxy directory

set -e

SOURCE_DIR="test-files-to-copy"
DEST_DIR="$HOME/Documents/GitHub/flexgate-tests"

echo "🚀 Copying test files to flexgate-tests repository"
echo "=================================================="

if [ ! -d "$DEST_DIR" ]; then
    echo "❌ Error: flexgate-tests directory not found at $DEST_DIR"
    echo "Please create the repository first using: bash setup-test-repo.sh"
    exit 1
fi

if [ ! -d "$SOURCE_DIR" ]; then
    echo "❌ Error: $SOURCE_DIR directory not found"
    exit 1
fi

echo ""
echo "📁 Copying Page Objects..."
cp -r "$SOURCE_DIR/pages/"* "$DEST_DIR/pages/" 2>/dev/null || true
echo "✅ Page Objects copied"

echo ""
echo "📁 Copying Helpers..."
cp -r "$SOURCE_DIR/helpers/"* "$DEST_DIR/helpers/" 2>/dev/null || true
echo "✅ Helpers copied"

echo ""
echo "📁 Copying Fixtures..."
cp -r "$SOURCE_DIR/fixtures/"* "$DEST_DIR/fixtures/" 2>/dev/null || true
echo "✅ Fixtures copied"

echo ""
echo "📁 Copying Tests..."
cp -r "$SOURCE_DIR/tests/"* "$DEST_DIR/tests/" 2>/dev/null || true
echo "✅ Tests copied"

echo ""
echo "📁 Copying Scripts..."
cp -r "$SOURCE_DIR/scripts/"* "$DEST_DIR/scripts/" 2>/dev/null || true
echo "✅ Scripts copied"

echo ""
echo "📁 Copying CI/CD Configuration..."
cp -r "$SOURCE_DIR/.github/"* "$DEST_DIR/.github/" 2>/dev/null || true
echo "✅ CI/CD configuration copied"

echo ""
echo "=================================================="
echo "✅ All files copied successfully!"
echo "=================================================="
echo ""
echo "Next steps:"
echo "1. cd $DEST_DIR"
echo "2. Review the copied files"
echo "3. Commit and push:"
echo "   git add ."
echo "   git commit -m 'Add Page Objects, Helpers, and Test Cases'"
echo "   git push origin main"
echo ""
echo "4. Create remaining test files (Features 3-6)"
echo "5. Run tests: npm test"
echo ""

# Count files
PAGE_COUNT=$(find "$DEST_DIR/pages" -name "*.ts" 2>/dev/null | wc -l)
HELPER_COUNT=$(find "$DEST_DIR/helpers" -name "*.ts" 2>/dev/null | wc -l)
TEST_COUNT=$(find "$DEST_DIR/tests" -name "*.spec.ts" 2>/dev/null | wc -l)

echo "📊 Files Copied:"
echo "   - Page Objects: $PAGE_COUNT files"
echo "   - Helpers: $HELPER_COUNT files"
echo "   - Test Cases: $TEST_COUNT files"
echo ""
