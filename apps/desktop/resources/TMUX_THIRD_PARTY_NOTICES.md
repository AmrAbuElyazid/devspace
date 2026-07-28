# Bundled tmux notices

Devspace redistributes a pinned arm64 tmux runtime so managed terminals do not
depend on a host installation. It runs on a Devspace-owned socket and does not
load the user's tmux configuration.

The bundle manifest is `tmux-bundle.json`; `tmux-files.sha256` covers every
redistributed executable, library, and license file. The original license texts
are included under `bin/licenses/tmux/`.

- tmux 3.4: ISC license
- libevent 2.1.12_1: 3-clause BSD license
- ncurses 6.5: X11-style license
- utf8proc 2.9.0: MIT license

Maintainers regenerate the bundle with `apps/desktop/scripts/bundle-tmux.sh`
and verify its version, architecture, checksums, and load paths with
`apps/desktop/scripts/verify-tmux-bundle.sh`.
