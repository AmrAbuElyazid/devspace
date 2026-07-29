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

# otool only sees linked libraries. The terminfo database path is a string
# compiled into libncursesw, and Homebrew builds it pointing at their own
# Cellar — a directory that does not exist on a user's Mac. ncurses will not
# fall back to /usr/share/terminfo on its own, so shipping this without naming
# the system database made every new tmux session die with
# "missing or unsuitable terminal: xterm-256color". The app supplies
# TERMINFO_DIRS to cover it; these checks keep both halves honest.
system_terminfo="/usr/share/terminfo"
for entry in tmux-256color xterm-256color; do
  if ! compgen -G "$system_terminfo/*/$entry" >/dev/null; then
    echo "System terminfo is missing $entry, which the tmux config depends on" >&2
    exit 1
  fi
done

if ! grep -q "$system_terminfo" "$desktop_dir/src/main/ghostty-env.ts"; then
  echo "ghostty-env no longer puts $system_terminfo on the terminfo search path" >&2
  exit 1
fi

codesign --verify --strict "$tmux_binary"
for library_path in "$resources_dir/bin/lib"/*.dylib; do
  codesign --verify --strict "$library_path"
done
