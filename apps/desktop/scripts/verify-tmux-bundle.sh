#!/bin/bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
desktop_dir="$(cd "$script_dir/.." && pwd)"
resources_dir="$desktop_dir/resources"
tmux_binary="$resources_dir/bin/tmux"

(
  cd "$resources_dir"
  shasum -a 256 -c tmux-files.sha256
)

if [[ "$($tmux_binary -V)" != "tmux 3.4" ]]; then
  echo "Bundled tmux version does not match the pin" >&2
  exit 1
fi

if [[ "$(lipo -archs "$tmux_binary")" != "arm64" ]]; then
  echo "Bundled tmux must be arm64" >&2
  exit 1
fi

if otool -L "$tmux_binary" | grep -E '/opt/homebrew|/usr/local' >/dev/null; then
  echo "Bundled tmux still references package-manager libraries" >&2
  exit 1
fi

codesign --verify --strict "$tmux_binary"
for library_path in "$resources_dir/bin/lib"/*.dylib; do
  codesign --verify --strict "$library_path"
done
