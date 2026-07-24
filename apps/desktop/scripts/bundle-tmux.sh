#!/bin/bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
desktop_dir="$(cd "$script_dir/.." && pwd)"
bundle_dir="$desktop_dir/resources/bin"
library_dir="$bundle_dir/lib"
license_dir="$bundle_dir/licenses/tmux"

tmux_prefix="${DEVSPACE_TMUX_PREFIX:-$(brew --prefix tmux)}"
libevent_prefix="${DEVSPACE_LIBEVENT_PREFIX:-$(brew --prefix libevent)}"
ncurses_prefix="${DEVSPACE_NCURSES_PREFIX:-$(brew --prefix ncurses)}"
utf8proc_prefix="${DEVSPACE_UTF8PROC_PREFIX:-$(brew --prefix utf8proc)}"

tmux_source="$tmux_prefix/bin/tmux"
libevent_source="$libevent_prefix/lib/libevent_core-2.1.7.dylib"
ncurses_source="$ncurses_prefix/lib/libncursesw.6.dylib"
utf8proc_source="$utf8proc_prefix/lib/libutf8proc.3.dylib"

for source_path in "$tmux_source" "$libevent_source" "$ncurses_source" "$utf8proc_source"; do
  if [[ ! -f "$source_path" ]]; then
    echo "Missing tmux bundle input: $source_path" >&2
    exit 1
  fi
done

if [[ "$($tmux_source -V)" != "tmux 3.4" ]]; then
  echo "Expected the pinned tmux 3.4 input" >&2
  exit 1
fi

mkdir -p "$library_dir" "$license_dir"
cp -f "$tmux_source" "$bundle_dir/tmux"
cp -f "$libevent_source" "$library_dir/libevent_core-2.1.7.dylib"
cp -f "$ncurses_source" "$library_dir/libncursesw.6.dylib"
cp -f "$utf8proc_source" "$library_dir/libutf8proc.3.dylib"

install_name_tool \
  -change "$utf8proc_source" '@executable_path/lib/libutf8proc.3.dylib' \
  -change "$ncurses_source" '@executable_path/lib/libncursesw.6.dylib' \
  -change "$libevent_source" '@executable_path/lib/libevent_core-2.1.7.dylib' \
  "$bundle_dir/tmux"

install_name_tool -id '@loader_path/libutf8proc.3.dylib' "$library_dir/libutf8proc.3.dylib"
install_name_tool -id '@loader_path/libncursesw.6.dylib' "$library_dir/libncursesw.6.dylib"
install_name_tool \
  -id '@loader_path/libevent_core-2.1.7.dylib' \
  "$library_dir/libevent_core-2.1.7.dylib"

chmod 0755 "$bundle_dir/tmux"
chmod 0644 "$library_dir"/*.dylib

# install_name_tool invalidates Homebrew's ad-hoc signatures. Re-sign locally;
# electron-builder replaces these with the release identity during packaging.
codesign --force --sign - "$library_dir/libutf8proc.3.dylib"
codesign --force --sign - "$library_dir/libncursesw.6.dylib"
codesign --force --sign - "$library_dir/libevent_core-2.1.7.dylib"
codesign --force --sign - "$bundle_dir/tmux"

cp -f "$tmux_prefix/COPYING" "$license_dir/tmux-ISC.txt"
cp -f "$libevent_prefix/LICENSE" "$license_dir/libevent-BSD-3-Clause.txt"
cp -f "$ncurses_prefix/COPYING" "$license_dir/ncurses-X11.txt"
cp -f "$utf8proc_prefix/LICENSE.md" "$license_dir/utf8proc-MIT.txt"

(
  cd "$desktop_dir/resources"
  find bin/tmux bin/lib bin/licenses/tmux -type f -print | LC_ALL=C sort | xargs shasum -a 256
) > "$desktop_dir/resources/tmux-files.sha256"

"$script_dir/verify-tmux-bundle.sh"
