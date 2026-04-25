# Third-Party Notices

`ghostty-electron` redistributes a pinned dependency bundle under
`deps/libghostty/`.

The bundle is intentionally version-locked and auditable:

- upstream source: `ghostty-org/ghostty` tag `v1.3.1`
- upstream license: MIT
- default release host for the prebuilt archive: GitHub release `ghostty-deps-v1.3.1` in `AmrAbuElyazid/devspace`
- integrity check: every extracted file is verified against `libghostty-files.sha256`

Maintainers rebuild and package this bundle with
`scripts/build-libghostty.sh`, `scripts/write-libghostty-checksums.sh`, and
`scripts/bundle-libghostty.sh`.

## Ghostty

- Project: Ghostty
- Source: https://github.com/ghostty-org/ghostty
- License: MIT
- Upstream license file: https://github.com/ghostty-org/ghostty/blob/main/LICENSE

The upstream-derived contents in `deps/libghostty/` include:

- `include/ghostty.h`
- `lib/libghostty.a`
- `share/ghostty/`, including shell integration resources and the upstream `xterm-ghostty.terminfo` source file
- `share/terminfo/`, which contains compiled terminfo entries generated from the upstream terminfo source during bundling

These files are rebuilt from the pinned upstream tag by
`scripts/build-libghostty.sh`; they are not copied from a locally installed
Ghostty app bundle.

## Devspace-Maintained Files In The Bundle

The bundle also contains first-party Devspace wrapper files under
`deps/libghostty/share/devspace-shell-integration/`.

- These files are maintained in this repository.
- They are not part of upstream Ghostty.
- They remain covered by this repository's MIT license.

## Shell Integration Files With Preserved Upstream Notices

Some bundled shell integration files inside
`deps/libghostty/share/ghostty/shell-integration/` retain their own upstream
file headers.

In particular, the following vendored files state that they are based on
Kitty shell integration and are distributed under GPLv3:

- `deps/libghostty/share/ghostty/shell-integration/bash/ghostty.bash`
- `deps/libghostty/share/ghostty/shell-integration/zsh/.zshenv`
- `deps/libghostty/share/ghostty/shell-integration/zsh/ghostty-integration`

Those per-file notices are preserved in the vendored files and should be read
alongside Ghostty's top-level license for the bundled dependency contents.

When bumping the Ghostty pin, review this file together with
`libghostty-bundle.json` and the checked-in bundle contents so the documented
provenance and preserved notices continue to match what is redistributed.
