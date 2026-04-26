#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
NATIVE_ADDON_PATH="$REPO_ROOT/packages/ghostty-electron/native/build/Release/ghostty_bridge.node"

if [[ -f "$NATIVE_ADDON_PATH" ]]; then
  exit 0
fi

printf '[devspace] ghostty native addon missing, rebuilding...\n'
bun run --cwd "$REPO_ROOT/apps/desktop" rebuild-native
