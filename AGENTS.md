# AGENTS.md

This file is for AI coding agents working in this repository. We're building
Devspace together, things move fast and conventions evolve. If you spot
something outdated, contradictory, or confusing in here or in the codebase,
flag it so we can maintain this document together.

All of `bun fmt`, `bun lint`, `bun knip`, and `bun typecheck` must pass before considering tasks completed.

**Important**: Always use `bun run test`, never `bun test`. The latter
invokes Bun's built-in test runner instead of Vitest.

## Project overview

Devspace is an Electron desktop app (developer tool) built with TypeScript,
React 19, and Tailwind CSS 4. It embeds terminal, browser, and editor panes
inside workspace windows.

The repository is a **Turborepo monorepo** with Bun workspaces:

| Workspace           | Path                         | Description                                           |
| ------------------- | ---------------------------- | ----------------------------------------------------- |
| `@devspace/desktop` | `apps/desktop/`              | Electron desktop app                                  |
| `ghostty-electron`  | `packages/ghostty-electron/` | Reusable Ghostty terminal bridge (N-API + TypeScript) |
| `@devspace/scripts` | `scripts/`                   | Monorepo-level utility scripts                        |

**Package manager**: Bun (use `bun` / `bunx`, not `npm` / `npx`).

## Build, lint, test

All commands run from the **monorepo root**:

```sh
bun install              # install deps (all workspaces)
bun run dev              # start in dev mode (turbo → electron-vite)
bun run build            # production build (turbo → electron-vite)
bun run typecheck        # tsc --noEmit across all workspaces
bun run lint             # oxlint (not eslint)
bun run fmt              # oxfmt (not prettier)
bun run fmt:check        # check formatting without writing
bun run knip             # detect unused exports/deps
bun run test             # vitest run across all workspaces
```

### Running a single test

Tests live in `apps/desktop/`:

```sh
bunx vitest run apps/desktop/src/path/to/file.test.ts      # run once
bunx vitest apps/desktop/src/path/to/file.test.ts           # watch mode
bunx vitest run -t "test name substring"                    # filter by name
```

### Native addon

The Ghostty bridge requires a compiled native addon. After a fresh clone
or when native code changes:

```sh
bun run rebuild-native --filter=@devspace/desktop
```

## Architecture

### Monorepo layout

```
apps/
  desktop/               # Electron app (main, preload, renderer, shared)
    src/
      main/              # Node.js main process
      preload/           # contextBridge between main <-> renderer
      renderer/          # React UI (Vite-bundled)
      shared/            # Types and constants shared across layers
packages/
  ghostty-electron/      # Reusable Ghostty terminal bridge
    src/                 # GhosttyTerminal class, types, native addon loader
    native/              # Objective-C++ N-API addon (binding.gyp, .mm, .h)
    deps/                # Pre-built libghostty static library + resources
scripts/                 # Monorepo-level scripts (promote, bench, stress)
```

### ghostty-electron package

The `ghostty-electron` package provides a generic `GhosttyTerminal` class
with a typed event API (`.on()` / `.off()`). It has **no Devspace-specific
logic** — shell integration env vars, ZDOTDIR wrappers, and app-specific
callbacks are the responsibility of the consuming app (`apps/desktop/`).

The native addon path must be provided by the consumer via
`GhosttyTerminalConfig.nativeAddonPath` because bundlers (vite, webpack)
can't resolve `.node` file paths after inlining the package.

### Workspace dependencies

```
ghostty-electron        (standalone, no workspace deps)
     ↑
@devspace/desktop       (depends on ghostty-electron via workspace:*)
```

## Testing

Framework: **Vitest**. Tests live co-located with source files.

## Error handling

- **IPC handlers**: validate every argument with `typeof` guards before
  proceeding; return early on invalid input.

## Formatting and linting

The project uses **oxfmt** (formatter) and **oxlint** (linter).
Both run from the monorepo root and cover all workspaces.

## Monorepo conventions

- **Shared dependency versions**: Use `catalog:` in workspace `package.json`
  files. Version pins live in the root `package.json` under
  `workspaces.catalog`.
- **Turborepo**: Task orchestration via `turbo.json`. `build` and `typecheck`
  are topological (`dependsOn: ["^build"]`). `dev` is persistent with no cache.
- **TypeScript**: All workspace `tsconfig.json` files extend
  `tsconfig.base.json` at the monorepo root.
