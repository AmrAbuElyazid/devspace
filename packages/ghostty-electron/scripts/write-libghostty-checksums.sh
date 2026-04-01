#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DEPS_DIR="$PROJECT_DIR/deps"
OUTPUT_FILE="$PROJECT_DIR/libghostty-files.sha256"

cd "$DEPS_DIR"
find libghostty -type f | LC_ALL=C sort | while read -r file; do
  shasum -a 256 "$file"
done > "$OUTPUT_FILE"
