#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CHECKSUM_FILE="$PROJECT_DIR/libghostty-files.sha256"
DEPS_DIR="$PROJECT_DIR/deps"

cd "$DEPS_DIR"
shasum -a 256 -c "$CHECKSUM_FILE"
