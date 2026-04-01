#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
MANIFEST_FILE="$PROJECT_DIR/libghostty-bundle.json"
DIST_DIR="$PROJECT_DIR/dist"

ASSET_NAME="$(node -p "const manifest=require(process.argv[1]); manifest.assetName" "$MANIFEST_FILE")"

bash "$SCRIPT_DIR/verify-libghostty.sh"

mkdir -p "$DIST_DIR"
rm -f "$DIST_DIR/$ASSET_NAME"
tar -C "$PROJECT_DIR/deps" -czf "$DIST_DIR/$ASSET_NAME" libghostty

echo "Wrote $DIST_DIR/$ASSET_NAME"
