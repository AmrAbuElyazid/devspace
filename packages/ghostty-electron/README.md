# ghostty-electron

Embed [Ghostty](https://ghostty.org) terminal surfaces in Electron apps.

This package wraps Ghostty's libghostty via a native N-API addon and exposes
a TypeScript API for creating, positioning, and managing terminal surfaces
within an Electron `BrowserWindow`.

> **Status**: In active development and used by the Devspace desktop app.
> macOS arm64 only. API may still change.
> Public source is provided for transparency and experimentation, but this
> package is currently consumed as a repo workspace package only. It is not
> published to npm and is not supported as a standalone dependency yet.

## Requirements

- macOS (arm64)
- Electron >= 30
- node-gyp build toolchain (Xcode Command Line Tools)
- pinned `libghostty` bundle metadata from this repo

## Workspace Usage

Within this repo, or another monorepo intentionally using the workspace
protocol:

```json
{
  "dependencies": {
    "ghostty-electron": "workspace:*"
  }
}
```

After installing, compile the native addon against your Electron version:

```sh
bun run --cwd packages/ghostty-electron rebuild-native
```

Or from the consuming app:

```sh
bun run rebuild-native
```

## Usage

```typescript
import { GhosttyTerminal } from "ghostty-electron";
import { resolve } from "path";

// 1. Create an instance
const terminal = new GhosttyTerminal();

// 2. Initialize with the Electron window handle and native addon path
terminal.init({
  windowHandle: mainWindow.getNativeWindowHandle(),
  nativeAddonPath: resolve(__dirname, "path/to/ghostty_bridge.node"),
});

// 3. Listen for events
terminal.on("title-changed", (surfaceId, title) => {
  console.log(`Terminal ${surfaceId} title: ${title}`);
});

terminal.on("pwd-changed", (surfaceId, pwd) => {
  console.log(`Terminal ${surfaceId} cwd: ${pwd}`);
});

terminal.on("surface-closed", (surfaceId) => {
  console.log(`Terminal ${surfaceId} closed`);
});

// 4. Create a terminal surface
terminal.createSurface("term-1", {
  cwd: "/Users/me/projects",
  envVars: { MY_VAR: "hello" },
});

// 5. Position it within the window (CSS pixels)
terminal.setBounds("term-1", { x: 0, y: 40, width: 800, height: 560 });

// 6. Show and focus
terminal.showSurface("term-1");
terminal.focusSurface("term-1");

// 7. Clean up when done
terminal.destroy();
```

## API

### `GhosttyTerminal`

The main class. One instance per `BrowserWindow`.

#### `init(config: GhosttyTerminalConfig)`

Initialize the native bridge. Must be called before any other method.

| Property          | Type     | Description                                     |
| ----------------- | -------- | ----------------------------------------------- |
| `windowHandle`    | `Buffer` | From `BrowserWindow.getNativeWindowHandle()`    |
| `nativeAddonPath` | `string` | Absolute path to compiled `ghostty_bridge.node` |

#### `createSurface(surfaceId: string, options?: CreateSurfaceOptions)`

Spawn a new terminal surface. Each surface is an independent shell session
rendered via Metal.

| Option    | Type                      | Description                      |
| --------- | ------------------------- | -------------------------------- |
| `cwd`     | `string?`                 | Initial working directory        |
| `envVars` | `Record<string, string>?` | Additional environment variables |

#### `destroySurface(surfaceId: string)`

Kill the shell process and remove the surface.

#### `showSurface(surfaceId: string)` / `hideSurface(surfaceId: string)`

Toggle surface visibility.

#### `focusSurface(surfaceId: string)` / `blurSurfaces()`

Direct keyboard input to a surface, or remove focus from all surfaces.

#### `setBounds(surfaceId: string, bounds: TerminalBounds)`

Position and size a surface within the window. Coordinates are CSS pixels
relative to the window's content area.

#### `setVisibleSurfaces(surfaceIds: string[])`

Batch-set which surfaces are visible. Surfaces not in the list are hidden.

#### `sendBindingAction(surfaceId: string, action: string): boolean`

Send a Ghostty key binding action (e.g. `"increase_font_size:1"`,
`"copy_to_clipboard"`, `"search"`).

#### `setReservedShortcuts(shortcuts: ReservedShortcut[])`

Register keyboard shortcuts that Ghostty should pass through to your app
instead of handling itself.

#### `on(event, listener)` / `off(event, listener)`

Type-safe event subscription. Available events:

| Event             | Callback Signature                 |
| ----------------- | ---------------------------------- |
| `title-changed`   | `(surfaceId, title) => void`       |
| `surface-closed`  | `(surfaceId) => void`              |
| `surface-focused` | `(surfaceId) => void`              |
| `pwd-changed`     | `(surfaceId, pwd) => void`         |
| `notification`    | `(surfaceId, title, body) => void` |
| `search-start`    | `(surfaceId, needle) => void`      |
| `search-end`      | `(surfaceId) => void`              |
| `search-total`    | `(surfaceId, total) => void`       |
| `search-selected` | `(surfaceId, selected) => void`    |

#### `destroy()`

Destroy all surfaces, clear listeners, release the native bridge.

## Shell integration

Ghostty supports shell integration (CWD tracking, prompt marking) for zsh,
bash, and fish. The integration scripts ship in
`deps/libghostty/share/ghostty/shell-integration/`.

The package does **not** inject these automatically. Your app is responsible
for setting the appropriate env vars via `createSurface({ envVars })`. See
the Devspace desktop app (`apps/desktop/src/main/terminal-manager.ts`) for
a reference implementation covering zsh ZDOTDIR wrapping, bash
PROMPT_COMMAND, and fish XDG_DATA_DIRS injection.

## Provisioning libghostty

`rebuild-native` first verifies the contents of `deps/libghostty/` against the
repo-pinned checksum manifest in `libghostty-files.sha256`.

If the bundle is missing, it downloads the pinned release asset described by
`libghostty-bundle.json` and verifies the extracted contents before linking the
native addon.

The bundle manifest records both the pinned upstream Ghostty tag and the
default GitHub repository used to host the prebuilt archive. Third-party and
preserved upstream notices for the bundled files live in
[`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).

For local forks or private mirrors, you can override the download URL with:

```sh
DEVSPACE_LIBGHOSTTY_BUNDLE_URL=https://example.com/libghostty.tar.gz bun run rebuild-native
```

You can also override the GitHub repository used for release downloads:

```sh
DEVSPACE_LIBGHOSTTY_REPOSITORY=owner/devspace bun run rebuild-native
```

## Building libghostty From Source

Only maintainers updating the pinned Ghostty dependency should build from
source:

```sh
bun run build-libghostty
bun run refresh-libghostty-checksums
bun run bundle-libghostty
```

This clones the pinned Ghostty tag, rebuilds `libghostty`, refreshes the
checksum manifest, and packages the publishable release bundle.

When the Ghostty pin changes, also review `libghostty-bundle.json` and
`THIRD_PARTY_NOTICES.md` so the recorded provenance and preserved notices stay
aligned with the published bundle.

The matching GitHub Actions workflow is:

- `.github/workflows/publish-ghostty-bundle.yml`

## Project structure

```
src/
  index.ts              Public API exports
  types.ts              TypeScript type definitions
  terminal-manager.ts   GhosttyTerminal class
  native.ts             Native addon loader + N-API interface types
libghostty-bundle.json  Pinned release metadata for provisioning
libghostty-files.sha256 Pinned content checksums for verification
native/
  binding.gyp           node-gyp build configuration
  ghostty_bridge.h      C++ header
  ghostty_bridge.mm     Objective-C++ implementation
deps/
  libghostty/           Pre-built static library + shell integration resources
scripts/
  build-libghostty.sh   Build script for libghostty from source
  bundle-libghostty.sh  Package pinned dependency bundle
  provision-libghostty.sh Download/verify pinned dependency bundle
  verify-libghostty.sh  Verify libghostty contents against repo checksums
```

## Known Limitations

- **macOS only** -- The native bridge uses Cocoa, Metal, and
  Objective-C++. No Windows/Linux support yet.
- **arm64 only** -- libghostty is currently built for Apple Silicon.
  x86_64 cross-compilation is not wired up.
- **No npm publish pipeline** -- The package exports raw TypeScript
  source. A build step (tsdown/tsup) is needed before publishing to npm.
  Works fine within a monorepo via workspace protocol.
- **Native addon coverage is still limited** -- The TypeScript wrapper and
  native loader have Vitest coverage, but the Objective-C++ bridge still
  relies on integration and manual testing.
- **Native addon path is manual** -- Consumers must provide the absolute
  path to `ghostty_bridge.node`. A `node-gyp-build` or `prebuild-install`
  pattern would improve this.
- **Terminal escape-sequence side effects need host-app policy** -- Clipboard
  reads/writes are currently completed without a separate confirmation UI.
  Terminal-driven open-url actions are constrained to `http` and `https`, but
  hosts should still decide whether to add user confirmation or app-level
  routing before treating this package as standalone-ready.
- **Single window** -- One `GhosttyTerminal` instance per
  `BrowserWindow`. Multi-window support requires multiple instances.

## License

The `ghostty-electron` package source in this repository is MIT licensed.

Bundled third-party dependency assets and preserved upstream notices for
`deps/libghostty/` are documented in
[`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).
