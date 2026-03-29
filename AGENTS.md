# AGENTS.md

This file is for AI coding agents working in this repository. We're building
Devspace together, things move fast and conventions evolve. If you spot
something outdated, contradictory, or confusing in here or in the codebase,
flag it so we can maintain this document together.

All of `bun fmt`, `bun lint`, `bun knip`, and `bun typecheck` must pass before considering tasks completed.

## Project overview

Devspace is an Electron desktop app (developer tool) built with TypeScript,
React 19, and Tailwind CSS 4. It embeds terminal, browser, and editor panes
inside workspace windows.

**Package manager**: Bun (use `bun` / `bunx`, not `npm` / `npx`).

## Build, lint, test

```sh
bun install              # install deps
bun run dev              # start in dev mode (electron-vite)
bun run build            # production build
bun run typecheck        # tsc --noEmit for both node and web tsconfigs
bun run lint             # oxlint (not eslint)
bun run fmt              # oxfmt (not prettier)
bun run fmt:check        # check formatting without writing
bun run knip             # detect unused exports/deps
bun run test             # vitest run (all tests)
```

### Running a single test

```sh
bunx vitest run src/path/to/file.test.ts          # run once
bunx vitest src/path/to/file.test.ts              # watch mode
bunx vitest run -t "test name substring"          # filter by name
```

## Architecture

Three-layer Electron architecture with a shared contract layer:

```
src/
  main/          # Node.js main process (Electron)
  preload/       # contextBridge between main <-> renderer
  renderer/      # React UI (Vite-bundled)
  shared/        # Types and constants shared across all layers
```

## Testing

Framework: **Vitest**. Tests live co-located with source files.

## Error handling

- **IPC handlers**: validate every argument with `typeof` guards before
  proceeding; return early on invalid input.

## Formatting and linting

The project uses **oxfmt** (formatter) and **oxlint** (linter).
