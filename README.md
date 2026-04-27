# Devspace

Devspace is an Electron desktop app for development workflows. It brings native
terminal panes, browser panes, and editor panes into a single workspace-driven
desktop UI.

## Status

Devspace is actively developed and still evolving quickly. The repository is
usable, but APIs and workflows are not fully stabilized yet.

Current focus areas:

- terminal performance and native view lifecycle quality
- browser and editor integration
- workspace and pane management ergonomics
- repo hardening and release readiness

## Highlights

- native Ghostty-backed terminal surfaces embedded inside the app
- mixed terminal, browser, and editor pane layouts
- multi-workspace desktop workflow
- TypeScript, React 19, Tailwind CSS 4, Electron
- Bun workspace monorepo with Turbo task orchestration

## Platform Support

Today, the project is primarily aimed at:

- macOS
- Apple Silicon

The `ghostty-electron` bridge is currently experimental and macOS-focused.

## Repository Layout

```text
apps/
  desktop/               Electron app
packages/
  ghostty-electron/      Ghostty native terminal bridge
  note-editor/           Internal renderer-only note editor core
scripts/                 Utility scripts and benchmarks
docs/                    Roadmaps, plans, and supporting docs
```

## Getting Started

Requirements:

- Bun
- Xcode Command Line Tools
- macOS development environment

Install dependencies from the repo root:

```sh
bun install
```

Start the app in development:

```sh
bun run dev
```

On a fresh clone, the first `bun run dev` automatically rebuilds the Ghostty
native addon if it is missing.

Run the main verification gate:

```sh
bun run fmt:check
bun run typecheck
bun run lint
bun run knip
bun run test
```

Generate a desktop coverage report:

```sh
bun run test:coverage
```

When native Ghostty code changes, rebuild the addon explicitly:

```sh
bun run rebuild-native
```

This now provisions the pinned `libghostty` bundle automatically. Building
Ghostty from source is only needed when updating the pinned bundle itself.

## Benchmarks

Terminal throughput notes live in [`BENCHMARKS.md`](./BENCHMARKS.md).

## Roadmap

The active improvement plan lives in:

- [`docs/roadmap.md`](./docs/roadmap.md)

## Release Notes

- [`docs/release-process.md`](./docs/release-process.md)

## Local Browser And Editor Behavior

Devspace embeds both general browser panes and VS Code web editor panes. A few
security and persistence tradeoffs are intentional today:

- embedded VS Code runs through a local `code serve-web` server bound to
  `127.0.0.1` on a fixed port with a Devspace-managed base path and connection
  token
- browser panes and editor panes use separate persistent Electron session
  partitions so editor auth/session state is isolated from normal browser panes
- browser-pane session cookies without an expiry are promoted to persistent
  cookies so sign-ins survive app restarts
- browser history is stored locally as plaintext JSON under Electron's
  `userData` directory in `browser-history.json`
- editor pane URLs are intentionally excluded from browser history because they
  carry connection tokens
- browser-pane passkeys on macOS Electron are not fully reliable today; use the
  `Open in External Browser` action for auth flows that need full browser
  support

In development, Devspace also uses separate `userData`, `sessionData`, and
browser/editor partitions so a dev run does not share browser/editor state with
the packaged app.

## Contributing

Contribution guidelines live in [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Security

Security reporting guidance lives in [`SECURITY.md`](./SECURITY.md).

## License

This repository is licensed under the MIT License. See [`LICENSE`](./LICENSE).

Bundled third-party dependency notices for `ghostty-electron` live in
[`packages/ghostty-electron/THIRD_PARTY_NOTICES.md`](./packages/ghostty-electron/THIRD_PARTY_NOTICES.md).
