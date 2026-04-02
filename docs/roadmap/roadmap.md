# Devspace Enhancement Plan

**Purpose:** Keep a single committed plan for improving Devspace over time across security, architecture, performance, testing, storage, release workflow, and open-source readiness.

### 1. Security And Hardening

- [ ] Tighten shared browser-session CORS and response rewriting so loopback-backed pages only receive the minimum cross-origin relaxation they need. Refs: `apps/desktop/src/main/browser/browser-session-manager.ts`, `apps/desktop/src/main/index.ts`
- [ ] Reduce renderer filesystem blast radius by narrowing broad file read/write APIs and pushing more file access behind task-specific privileged flows. Refs: `apps/desktop/src/preload/index.ts`, `apps/desktop/src/main/ipc/system.ts`, `apps/desktop/src/main/validation.ts`
- [ ] Scope the VS Code secret-key interception by trusted host/origin instead of path-only matching on the shared session. Refs: `apps/desktop/src/main/browser/browser-session-manager.ts`
- [ ] Make browser/editor `WebContentsView` security-sensitive preferences explicit and audit remaining session defaults. Refs: `apps/desktop/src/main/browser/browser-pane-manager.ts`, `apps/desktop/src/main/index.ts`
- [ ] Audit IPC registration consistency so privileged channels do not bypass the shared safety helpers without a clear reason. Initial target: `apps/desktop/src/main/shortcut-store.ts`. Refs: `apps/desktop/src/main/ipc/shared.ts`, `apps/desktop/src/main/shortcut-store.ts`

### 2. Architecture And Maintainability

- [ ] Break up oversized files over time. Initial targets: `apps/desktop/src/main/browser/browser-pane-manager.ts`, `apps/desktop/src/renderer/components/PaneGroupContainer.tsx`, and `apps/desktop/src/renderer/index.css`.
- [ ] Move native terminal/browser creation side effects out of React render paths and into commit-safe lifecycle handling. Refs: `apps/desktop/src/renderer/components/TerminalPane.tsx`, `apps/desktop/src/renderer/components/browser/useBrowserPaneController.ts`
- [ ] Replace `any` in `apps/desktop/src/main/ipc/shared.ts` with typed handler signatures and keep IPC registration strongly typed end-to-end.
- [ ] Align `DevspaceBridge` types with actual runtime return shapes for error-returning APIs. Initial targets: `fs.readFile`, `fs.writeFile`, and similar bridge methods. Refs: `apps/desktop/src/shared/types.ts`, `apps/desktop/src/preload/index.ts`
- [ ] Keep cleaning stale or leftover paths/docs when encountered. Initial targets: empty refactor directories and `AGENTS.md` workspace metadata.

### 3. Performance, Persistence, And Scale

- [ ] Keep improving native-view lifecycle efficiency and focus ownership so work scales with visible panes, not total mounted panes. Refs: `apps/desktop/src/renderer/App.tsx`, `apps/desktop/src/renderer/store/native-view-store.ts`, `apps/desktop/src/renderer/components/PaneGroupContainer.tsx`
- [ ] Revisit mixed-workspace scaling with many terminals, browsers, and editor panes open at once.
- [ ] Add lightweight production profiling counters for bounds sync, focus churn, visibility reconciliation, and mounted native panes.
- [ ] Migrate workspace persistence from renderer `localStorage` to SQLite behind a main/preload storage boundary, using a relational core with JSON for flexible structures. Refs: `apps/desktop/src/renderer/store/persistence.ts`
- [ ] Add a one-time migration from the existing `devspace-workspaces` persisted JSON to the new SQLite schema. Refs: `apps/desktop/src/renderer/store/persistence.ts`

### 4. Testing And Quality

- [ ] Expand preload and IPC handler coverage for `apps/desktop/src/preload`, `apps/desktop/src/main/ipc/browser.ts`, `apps/desktop/src/main/ipc/system.ts`, and `apps/desktop/src/main/ipc/terminal-editor.ts`.
- [ ] Add shared test utilities for `window.api`, Electron primitives, and other common mocks to reduce bespoke setup across the test suite.
- [ ] Keep expanding behavior-heavy coverage where it pays off most, especially native-view lifecycle, browser security flows, and complex drag/drop interactions.
- [ ] Expand `packages/note-editor` coverage beyond current wrapper and serialization cases.

### 5. Package Maturity And Open-Source Readiness

- [ ] Harden `packages/ghostty-electron` teardown so native observers, callbacks, and surfaces are fully released. Refs: `packages/ghostty-electron/native/ghostty_bridge.mm`, `packages/ghostty-electron/src/terminal-manager.ts`
- [ ] Decide what `ghostty-electron` is as a public artifact: harden it as a package or document it clearly as an internal/experimental workspace dependency. Refs: `packages/ghostty-electron/README.md`, `packages/ghostty-electron/package.json`
- [ ] Improve `packages/note-editor` maturity by removing scaffold residue, reducing `@ts-nocheck` usage in core UI files, and tightening unsupported toolbar/plugin paths. Refs: `packages/note-editor/src/plate-ui/editor.tsx`, `packages/note-editor/src/plate-ui/turn-into-toolbar-button.tsx`, `packages/note-editor/src/plugins/note-editor-kit.tsx`
- [ ] Add changelog/release-note discipline when wider open-source distribution gets closer.

### 6. Repo Hygiene And Consistency

- [ ] Migrate the remaining legacy `.js` tests to TypeScript.

## Suggested Execution Order

### Phase 1: Core Boundaries

- [ ] Tighten shared browser-session CORS and response rewriting.
- [ ] Narrow renderer filesystem privileges.
- [ ] Scope VS Code secret-key interception by origin.
- [ ] Make `WebContentsView` security posture explicit.
- [ ] Fix IPC foundation typing and `DevspaceBridge` mismatches.

### Phase 2: Scalability And Storage

- [ ] Move native terminal/browser creation out of render paths.
- [ ] Continue native-view lifecycle and focus scalability work.
- [ ] Add profiling counters.
- [ ] Migrate persistence from `localStorage` to SQLite with a relational core plus JSON-backed flexible structures.
- [ ] Revisit mixed-workspace stress behavior.

### Phase 3: Test Depth And Package Maturity

- [ ] Expand preload and IPC coverage.
- [ ] Add shared test utilities.
- [ ] Expand `note-editor` coverage and cleanup.
- [ ] Harden `ghostty-electron` teardown.
- [ ] Decide public packaging posture for `ghostty-electron`.
