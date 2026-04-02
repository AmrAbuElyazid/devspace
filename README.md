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

When native Ghostty code changes, rebuild the addon:

```sh
bun run rebuild-native
```

This now provisions the pinned `libghostty` bundle automatically. Building
Ghostty from source is only needed when updating the pinned bundle itself.

## Benchmarks

Terminal throughput notes live in [`BENCHMARKS.md`](./BENCHMARKS.md).

## Roadmap

The active improvement plan lives in:

- [`docs/roadmap/roadmap.md`](./docs/roadmap/roadmap.md)

## Release Notes

- [`docs/release-process.md`](./docs/release-process.md)

## Contributing

Contribution guidelines live in [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Security

Security reporting guidance lives in [`SECURITY.md`](./SECURITY.md).

## License

This repository is licensed under the MIT License. See [`LICENSE`](./LICENSE).
