#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

bash "$SCRIPT_DIR/provision-libghostty.sh" "$@"

cd "$PROJECT_DIR/native"
bun x node-gyp rebuild --target="$(node -e "console.log(require('electron/package.json').version)")" --arch="$(node -p "process.arch")" --dist-url=https://electronjs.org/headers
