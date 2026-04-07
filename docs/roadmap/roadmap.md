# Devspace Roadmap

**Purpose:** Keep a current strategic plan for Devspace across security, architecture, scale, persistence, testing, and package maturity.

This doc is for medium- and long-term work. Tactical bug reports and smaller UX requests should live in `docs/issues.md` so the roadmap stays focused on bigger engineering themes.

## Status Snapshot

### Completed Or Effectively Completed From The Previous Draft

- [x] Scope VS Code secret-key interception by trusted loopback origin. Refs: `apps/desktop/src/main/browser/browser-session-manager.ts`, `apps/desktop/src/main/ipc/terminal-editor.ts`
- [x] Centralize privileged IPC registration through shared safety helpers. Refs: `apps/desktop/src/main/ipc/shared.ts`, `apps/desktop/src/main/ipc-handlers.ts`
- [x] Remove the old broad renderer filesystem bridge in favor of narrower task-specific APIs. Refs: `apps/desktop/src/preload/index.ts`, `apps/desktop/src/main/ipc/system.ts`
- [x] Replace `any` in `apps/desktop/src/main/ipc/shared.ts` with typed helper signatures. Refs: `apps/desktop/src/main/ipc/shared.ts`
- [x] Move native terminal/browser creation side effects out of React render paths and into commit-safe lifecycle handling. Refs: `apps/desktop/src/renderer/components/TerminalPane.tsx`, `apps/desktop/src/renderer/components/browser/useBrowserPaneController.ts`
- [x] Add lightweight native-view profiling counters plus a debug snapshot/reset surface for visibility, bounds sync, and focus churn. Refs: `apps/desktop/src/renderer/store/native-view-store.ts`, `apps/desktop/src/renderer/main.tsx`

### Largely Addressed But Still Worth Follow-Up

- [ ] Finish tightening shared-session CORS rewriting to least privilege. Refs: `apps/desktop/src/main/browser/browser-session-manager.ts`
- [ ] Finish the browser/editor security audit now that `WebContentsView` preferences are explicit. Refs: `apps/desktop/src/main/browser/browser-pane-manager.ts`, `apps/desktop/src/main/index.ts`
- [ ] Continue breaking up large files where it meaningfully improves maintenance. Initial targets: `apps/desktop/src/main/browser/browser-pane-manager.ts`, `apps/desktop/src/renderer/components/PaneGroupContainer.tsx`, `apps/desktop/src/renderer/styles/index.css`
- [ ] Keep bridge types, tests, and docs aligned with the current preload/IPC surface. Refs: `apps/desktop/src/shared/types.ts`, `apps/desktop/src/preload/index.ts`
- [x] Finish migrating the last legacy `.js` tests to TypeScript. Refs: `apps/desktop/src/preload/__tests__/index.test.ts`, `apps/desktop/src/main/__tests__/ipc-handlers-browser.test.ts`
- [ ] Finish documenting the real package posture for `ghostty-electron` and clean stale repo docs. Refs: `packages/ghostty-electron/README.md`, `AGENTS.md`

## 1. Core Boundaries And Correctness

- [ ] Replace blanket trusted-origin CORS rewriting with per-need header rewrites so loopback-backed pages get only the relaxation they actually require. Refs: `apps/desktop/src/main/browser/browser-session-manager.ts`
- [ ] Add focused tests for the split preload and IPC modules, especially `apps/desktop/src/main/ipc/terminal-editor.ts`, uncovered `apps/desktop/src/main/ipc/browser.ts` flows, and non-notes `apps/desktop/src/main/ipc/system.ts` paths.
- [ ] Add shared test helpers for `window.api`, Electron mocks, and common renderer/main setup to reduce repeated bespoke mocks. Refs: `apps/desktop/src/test-setup.ts`
- [ ] Clean up stale docs that no longer match the repo layout or current package state. Initial targets: `AGENTS.md`, `packages/ghostty-electron/README.md`

## 2. Scale, Profiling, And Persistence

- [ ] Revisit workspace mounting and focus ownership so hidden work scales with visible panes rather than all stacked workspaces. Refs: `apps/desktop/src/renderer/App.tsx`, `apps/desktop/src/renderer/store/native-view-store.ts`, `apps/desktop/src/renderer/components/PaneGroupContainer.tsx`
- [ ] Migrate workspace persistence from renderer `localStorage` to SQLite behind a main/preload storage boundary, using a relational core with JSON-backed flexible structures. Refs: `apps/desktop/src/renderer/store/persistence.ts`
- [ ] Add a one-time import from the existing `devspace-workspaces` JSON persistence into the new SQLite schema. Refs: `apps/desktop/src/renderer/store/persistence.ts`
- [ ] Run a mixed-workspace stress pass that covers many terminals, browsers, editor panes, and t3code panes once instrumentation is in place.

## 3. Testing, Package Maturity, And Release Discipline

- [ ] Expand `packages/note-editor` coverage into plugin composition, toolbar behavior, and editor interactions. Refs: `packages/note-editor/src/plugins/note-editor-kit.tsx`, `packages/note-editor/src/plate-ui/editor.tsx`
- [ ] Remove `@ts-nocheck` from core `note-editor` UI files as types are tightened. Initial targets: `packages/note-editor/src/plate-ui/editor.tsx`, `packages/note-editor/src/plate-ui/turn-into-toolbar-button.tsx`
- [ ] Decide whether `ghostty-electron` is internal-only or truly publishable, then align `README.md`, `package.json`, and release expectations. Refs: `packages/ghostty-electron/README.md`, `packages/ghostty-electron/package.json`
- [ ] Add stronger teardown confidence for `ghostty-electron`, ideally beyond unit mocks where practical. Refs: `packages/ghostty-electron/native/ghostty_bridge.mm`, `packages/ghostty-electron/src/terminal-manager.ts`
- [ ] Add changelog/release-note discipline as the release process matures. Refs: `docs/release-process.md`

## Suggested Order

### Phase 1: Boundaries And Correctness

- [ ] Tighten CORS overrides to least privilege.
- [ ] Add split preload/IPC coverage and shared test helpers.
- [ ] Clean stale docs.

### Phase 2: Observability And Scale

- [ ] Revisit workspace mounting and native-view scaling.
- [ ] Run a mixed-workspace stress pass with instrumentation enabled.

### Phase 3: Persistence And Package Maturity

- [ ] Move workspace persistence behind main/preload with SQLite.
- [ ] Add the one-time `localStorage` to SQLite migration.
- [ ] Expand `note-editor` maturity and settle `ghostty-electron` packaging posture.
