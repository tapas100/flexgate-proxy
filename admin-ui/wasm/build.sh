#!/bin/bash
set -e

echo "🔨 Building WebAssembly Metrics Processor..."
echo ""

# Check if wasm-pack is installed
if ! command -v wasm-pack &> /dev/null; then
    echo "❌ wasm-pack not found!"
    echo ""
    echo "Install with:"
    echo "  curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh"
    echo ""
    exit 1
fi

# Check if Rust is installed
if ! command -v rustc &> /dev/null; then
    echo "❌ Rust not found!"
    echo ""
    echo "Install with:"
    echo "  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    echo ""
    exit 1
fi

# Add wasm32 target if not present
echo "📦 Ensuring wasm32 target..."
rustup target add wasm32-unknown-unknown 2>/dev/null || true

# Navigate to project directory
cd "$(dirname "$0")/metrics-processor"

echo "🏗️  Building WASM module (release mode)..."
wasm-pack build --target web --release --out-dir pkg

# Check build success
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Build successful!"
    echo ""
    echo "📊 Package Info:"
    ls -lh pkg/*.wasm | awk '{print "   WASM Binary: " $9 " (" $5 ")"}'
    echo ""
    echo "📦 Output directory: admin-ui/wasm/metrics-processor/pkg/"
    echo ""
    echo "🚀 Ready to use in TypeScript!"
else
    echo ""
    echo "❌ Build failed!"
    exit 1
fi
