# Third-Party Notices

`ghostty-electron` redistributes a pinned `libghostty` bundle under
`deps/libghostty/`.

## Ghostty

- Project: Ghostty
- Source: https://github.com/ghostty-org/ghostty
- License: MIT
- Upstream license file: https://github.com/ghostty-org/ghostty/blob/main/LICENSE

The bundled `libghostty` artifacts and related resources in
`deps/libghostty/` come from the Ghostty project.

## Shell Integration Files With Preserved Upstream Notices

Some bundled shell integration files inside
`deps/libghostty/share/ghostty/shell-integration/` retain their own upstream
file headers.

In particular, the following vendored files state that they are based on
Kitty shell integration and are distributed under GPLv3:

- `deps/libghostty/share/ghostty/shell-integration/bash/ghostty.bash`
- `deps/libghostty/share/ghostty/shell-integration/zsh/.zshenv`

Those per-file notices are preserved in the vendored files and should be read
alongside Ghostty's top-level license for the bundled dependency contents.
