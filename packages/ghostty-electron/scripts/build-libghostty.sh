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

# Copy shell integration scripts (for CWD tracking via OSC 7, prompt marking, etc.)
SHARE_DIR="$DEPS_DIR/share/ghostty"
mkdir -p "$SHARE_DIR/shell-integration"
if [ -d "$GHOSTTY_DIR/zig-out/share/ghostty/shell-integration" ]; then
  echo "Copying shell integration from build output..."
  rsync -a "$GHOSTTY_DIR/zig-out/share/ghostty/shell-integration/" "$SHARE_DIR/shell-integration/"
elif [ -d "$GHOSTTY_DIR/src/shell-integration" ]; then
  echo "Copying shell integration from source tree..."
  rsync -a "$GHOSTTY_DIR/src/shell-integration/" "$SHARE_DIR/shell-integration/"
fi

# Compile xterm-ghostty terminfo using the system's tic compiler.
# Stored outside GHOSTTY_RESOURCES_DIR to prevent the native bridge from
# forcing TERM=xterm-ghostty (which can cause display issues).
TERMINFO_DIR="$DEPS_DIR/share/terminfo"
if [ -f "$SHARE_DIR/xterm-ghostty.terminfo" ]; then
  echo "Compiling xterm-ghostty terminfo..."
  mkdir -p "$TERMINFO_DIR"
  tic -x -o "$TERMINFO_DIR" "$SHARE_DIR/xterm-ghostty.terminfo" 2>/dev/null || true
elif command -v infocmp >/dev/null 2>&1; then
  # Try to extract from the build output or system
  GHOSTTY_TERMINFO="$GHOSTTY_DIR/zig-out/share/terminfo"
  if [ -d "$GHOSTTY_TERMINFO" ]; then
    echo "Extracting and compiling terminfo from build output..."
    TERMINFO="$GHOSTTY_TERMINFO" infocmp -x xterm-ghostty > /tmp/xterm-ghostty.terminfo 2>/dev/null || true
    if [ -s /tmp/xterm-ghostty.terminfo ]; then
      mkdir -p "$TERMINFO_DIR"
      tic -x -o "$TERMINFO_DIR" /tmp/xterm-ghostty.terminfo 2>/dev/null || true
      cp /tmp/xterm-ghostty.terminfo "$SHARE_DIR/xterm-ghostty.terminfo"
    fi
    rm -f /tmp/xterm-ghostty.terminfo
  fi
fi

echo "Done. Artifacts in $DEPS_DIR"
ls -la "$DEPS_DIR/include/" "$DEPS_DIR/lib/"
