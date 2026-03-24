#!/bin/bash
set -euo pipefail

GHOSTTY_TAG="v1.3.1"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DEPS_DIR="$PROJECT_DIR/deps/libghostty"
GHOSTTY_DIR="$PROJECT_DIR/.ghostty-src"

# Clone Ghostty source at pinned tag
if [ ! -d "$GHOSTTY_DIR" ]; then
  echo "Cloning Ghostty at $GHOSTTY_TAG..."
  git clone --branch "$GHOSTTY_TAG" --depth 1 https://github.com/ghostty-org/ghostty.git "$GHOSTTY_DIR"
else
  echo "Ghostty source already exists at $GHOSTTY_DIR"
  cd "$GHOSTTY_DIR"
  CURRENT_TAG=$(git describe --tags --exact-match 2>/dev/null || echo "unknown")
  echo "Current tag: $CURRENT_TAG (expected: $GHOSTTY_TAG)"
fi

cd "$GHOSTTY_DIR"

# Build libghostty (library mode, no app runtime)
echo "Building libghostty with Zig..."
zig build -Dapp-runtime=none -Doptimize=ReleaseFast

# Copy artifacts from the XCFramework (macOS universal binary)
echo "Copying build artifacts..."
mkdir -p "$DEPS_DIR/include" "$DEPS_DIR/lib"

XCFW_DIR="$GHOSTTY_DIR/macos/GhosttyKit.xcframework/macos-arm64_x86_64"

# Copy the static library
cp "$XCFW_DIR/libghostty.a" "$DEPS_DIR/lib/"

# Copy the main header
cp "$XCFW_DIR/Headers/ghostty.h" "$DEPS_DIR/include/"

echo "Done. Artifacts in $DEPS_DIR"
ls -la "$DEPS_DIR/include/" "$DEPS_DIR/lib/"
