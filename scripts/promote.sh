#!/bin/bash
#
# promote.sh — Build Devspace and install to /Applications.
#
# This replaces the stable build you use day-to-day. The old .app is
# moved to Trash so you can recover it if something goes wrong.
#
# Usage:
#   scripts/promote.sh           # full build + install
#   scripts/promote.sh --skip-build   # install existing build only

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
APP_NAME="Devspace.app"
INSTALL_DIR="/Applications"
RELEASE_DIR="$PROJECT_DIR/release/mac-arm64"
BUILT_APP="$RELEASE_DIR/$APP_NAME"
INSTALLED_APP="$INSTALL_DIR/$APP_NAME"

cd "$PROJECT_DIR"

# ── Parse args ──────────────────────────────────────────────────────────────

SKIP_BUILD=false
if [ "${1:-}" = "--skip-build" ]; then
  SKIP_BUILD=true
fi

# ── Build ───────────────────────────────────────────────────────────────────

if [ "$SKIP_BUILD" = false ]; then
  echo "==> Running checks..."
  bun run fmt
  bun run lint
  bun run typecheck
  bun run test

  echo ""
  echo "==> Building app..."
  bun run dist

  echo ""
fi

# ── Verify build exists ────────────────────────────────────────────────────

if [ ! -d "$BUILT_APP" ]; then
  echo "Error: Built app not found at $BUILT_APP" >&2
  echo "Run without --skip-build to create it." >&2
  exit 1
fi

# ── Check if stable app is running ─────────────────────────────────────────

if pgrep -f "$INSTALLED_APP" >/dev/null 2>&1; then
  echo "Warning: Devspace is currently running." >&2
  echo "Quit Devspace before promoting, then run this script again." >&2
  exit 1
fi

# ── Move old build to Trash ────────────────────────────────────────────────

if [ -d "$INSTALLED_APP" ]; then
  echo "==> Moving old $APP_NAME to Trash..."
  # Use Finder's Trash via osascript so it's recoverable
  osascript -e "tell application \"Finder\" to delete POSIX file \"$INSTALLED_APP\"" >/dev/null 2>&1 || {
    echo "Error: Could not move old app to Trash. Remove it manually:" >&2
    echo "  rm -rf '$INSTALLED_APP'" >&2
    exit 1
  }
fi

# ── Copy new build ─────────────────────────────────────────────────────────

echo "==> Installing new build to $INSTALL_DIR..."
cp -R "$BUILT_APP" "$INSTALLED_APP"

# ── Update CLI symlink ─────────────────────────────────────────────────────

CLI_SYMLINK="/usr/local/bin/devspace"
CLI_TARGET="$INSTALLED_APP/Contents/Resources/bin/devspace"

if [ -L "$CLI_SYMLINK" ]; then
  echo "==> Updating CLI symlink..."
  ln -sf "$CLI_TARGET" "$CLI_SYMLINK"
fi

echo ""
echo "Done. Open Devspace from /Applications or run: open -a Devspace"
