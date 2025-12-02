#!/bin/bash
# Build script for Cursor 2D Video Editor (macOS/Linux)
# Usage: ./build.sh [win|mac|linux|all]

set -e

cd "$(dirname "$0")"

echo "========================================"
echo "Cursor 2D Video Editor - Build Script"
echo "========================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "ERROR: npm is not installed"
    exit 1
fi

echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"
echo ""

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
    echo ""
fi

# Determine build target
TARGET=${1:-""}

# Auto-detect platform if no target specified
if [ -z "$TARGET" ]; then
    case "$(uname -s)" in
        Darwin*)    TARGET="mac" ;;
        Linux*)     TARGET="linux" ;;
        MINGW*|CYGWIN*|MSYS*) TARGET="win" ;;
        *)          TARGET="linux" ;;
    esac
fi

echo "Building for target: $TARGET"
echo ""

case "$TARGET" in
    win)
        npm run build:win
        ;;
    mac)
        npm run build:mac
        ;;
    linux)
        npm run build:linux
        ;;
    all)
        npm run build:all
        ;;
    *)
        echo "ERROR: Unknown target '$TARGET'"
        echo "Usage: ./build.sh [win|mac|linux|all]"
        exit 1
        ;;
esac

echo ""
echo "========================================"
echo "Build completed successfully!"
echo "Output files are in the 'release' folder"
echo "========================================"
echo ""

ls -la release/ 2>/dev/null | grep -E '\.(exe|dmg|zip|AppImage|deb|rpm)$' || true
