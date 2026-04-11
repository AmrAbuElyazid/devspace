# Performance Audit

**Purpose:** capture the current performance state of the repo in an explicit `done` / `open` format so follow-up work stays grounded in what has actually landed.

## Summary

Devspace's biggest earlier renderer and native-view no-op paths have been reduced substantially. The highest-value remaining work is now measurement first, then targeted follow-up only where profiling still shows real cost.

The main open risks are:

- broad workspace persistence that still runs through synchronous SQLite work on the Electron main thread
- hidden terminal tabs in the active workspace still keep their native surfaces resident until the workspace is deactivated or the panes are closed
- native terminal events that still fan out across processes one message at a time
- remaining native-view visible-set and bounds work that still scales with active visible panes
- limited in-repo CPU, memory, and frame-pacing telemetry

## Done

### Persistence baseline is much stronger

- Renderer persistence is debounced and limited to the durable workspace snapshot instead of transient UI state.
- Main-process persistence now uses SQLite with migrations, prepared statements, and incremental row-level upserts/deletes inside a transaction instead of full delete-and-reinsert saves.
- Pane ownership is indexed by `paneId`, which lets terminal updates target the owning workspace directly instead of repeatedly searching the whole workspace graph.

Relevant files: `apps/desktop/src/renderer/store/persistence.ts`, `apps/desktop/src/main/workspace-persistence-store.ts`, `apps/desktop/src/main/workspace-persistence-migrations.ts`, `apps/desktop/src/main/workspace-persistence-statements.ts`, `apps/desktop/src/renderer/store/pane-ownership.ts`

### Native-view and browser visibility churn was cut down substantially

- Native-view reconcile now keys off visibility-relevant workspace and overlay changes rather than broad whole-store churn.
- Terminal and browser visible sets are diffed before IPC visibility updates are sent.
- Renderer bounds sync is coalesced behind one `requestAnimationFrame`, only observes visible native elements, and skips duplicate bounds writes.
- Browser pane lifecycle skips duplicate `setBounds` work and applies bounds before showing newly visible panes.
- Terminal unregister now clears cached element and bounds state so stale native-view bookkeeping is cleaned up promptly.

Relevant files: `apps/desktop/src/renderer/store/native-view-store.ts`, `apps/desktop/src/main/browser/browser-pane-manager.ts`, `apps/desktop/src/main/browser/browser-pane-view-lifecycle.ts`, `packages/ghostty-electron/native/ghostty_bridge.mm`

### Terminal event handling has meaningful duplicate suppression

- Ghostty native wakeups are coalesced behind a pending tick instead of waking the app repeatedly for each callback.
- Repeated `title-changed` and `pwd-changed` values are deduped in the terminal bridge before broader app work runs.
- Renderer title updates also skip redundant pane-title writes.

Relevant files: `packages/ghostty-electron/native/ghostty_bridge.mm`, `packages/ghostty-electron/src/terminal-manager.ts`, `apps/desktop/src/renderer/hooks/useTerminalEvents.ts`

### Several renderer hot paths are narrower than before

- Workspace sidebar metadata is computed and updated by affected workspace ids instead of forcing broader recompute patterns in hot flows.
- Only the active workspace layer mounts in React, which avoids keeping full inactive workspace trees mounted.
- Terminal surfaces in inactive workspaces are now evicted on workspace switch instead of remaining resident until later pane cleanup.
- Sidebar resize keeps live width local and commits the persisted setting only on mouseup.
- Settings text and number inputs now keep local draft state and commit on blur or Enter instead of persisting on every keystroke.
- Drag state now lives in a selector-based store instead of top-level React contexts, and `dropIntent` updates are semantically deduped.

Relevant files: `apps/desktop/src/renderer/store/workspace-sidebar-metadata.ts`, `apps/desktop/src/renderer/store/pane-ownership.ts`, `apps/desktop/src/renderer/App.tsx`, `apps/desktop/src/renderer/lib/terminal-surface-session.ts`, `apps/desktop/src/renderer/lib/pane-cleanup.ts`, `apps/desktop/src/renderer/components/Sidebar/Sidebar.tsx`, `apps/desktop/src/renderer/components/SettingsPage.tsx`, `apps/desktop/src/renderer/hooks/useDndOrchestrator.ts`

### Some measurement coverage already exists

- Native-view profiling counters and snapshots are exposed in the renderer for debug and E2E usage.
- Main-process performance snapshots now expose process memory and CPU, Electron app metrics, and per-operation timings for terminal and browser lifecycle calls.
- The mixed-workspace stress E2E covers native-view lifecycle behavior across repeated workspace switching.
- A dedicated hidden-terminal retention E2E now captures create/hide/destroy lifecycle counts and memory snapshots for retained terminal tabs.
- Manual benchmark and stress scripts already exist for terminal throughput and load testing.

Relevant files: `apps/desktop/src/renderer/store/native-view-store.ts`, `apps/desktop/src/renderer/main.tsx`, `apps/desktop/src/main/performance-monitor.ts`, `apps/desktop/src/main/terminal-manager.ts`, `apps/desktop/src/main/browser/browser-pane-manager.ts`, `apps/desktop/e2e/mixed-workspace-stress.spec.ts`, `apps/desktop/e2e/hidden-terminal-retention.spec.ts`, `apps/desktop/e2e/helpers/app.ts`, `BENCHMARKS.md`, `scripts/terminal-bench.sh`, `scripts/terminal-stress.sh`

## Open

### Measurement and instrumentation are still the top priority

- The repo now has a lightweight built-in performance snapshot for main-process memory, CPU, app metrics, native-view timings, and terminal/browser lifecycle call timings.
- What is still missing is repeatable baseline capture, renderer-specific memory attribution, per-terminal retention accounting, and longer-run leak detection.
- Resize latency and frame pacing still need stronger scenario-based measurement than the current counters provide.

Relevant files: `apps/desktop/src/renderer/store/native-view-store.ts`, `apps/desktop/src/main/performance-monitor.ts`, `apps/desktop/e2e/mixed-workspace-stress.spec.ts`, `BENCHMARKS.md`

### Workspace persistence is still broad and main-thread bound

- The persisted snapshot still includes `workspaces`, `activeWorkspaceId`, `pinnedSidebarNodes`, `sidebarTree`, `panes`, and `paneGroups`.
- Saves still run through `DatabaseSync` on the Electron main process.
- `beforeunload` still performs a synchronous final flush.

Relevant files: `apps/desktop/src/renderer/store/persistence.ts`, `apps/desktop/src/main/ipc/workspace-state.ts`, `apps/desktop/src/main/workspace-persistence-store.ts`

### Hidden terminal tabs in the active workspace still retain native surfaces and shell processes

- Terminal surfaces no longer survive inactive-workspace switches, but they still survive active-workspace tab switches and remounts.
- Hidden terminal tabs inside the active workspace are still hidden rather than destroyed.
- Memory therefore still scales with terminal tab count inside the active workspace until the workspace is deactivated or panes are explicitly closed.

Relevant files: `apps/desktop/src/renderer/components/TerminalPane.tsx`, `apps/desktop/src/renderer/lib/terminal-surface-session.ts`, `apps/desktop/src/renderer/lib/pane-cleanup.ts`, `packages/ghostty-electron/native/ghostty_bridge.mm`

### Terminal events still cross layers one by one

- Title, close, focus, pwd, and search events still fan out as separate messages across native code, the main process, preload, and the renderer.
- The existing dedupe helps, but bursty terminals can still create per-event CPU and queue overhead.

Relevant files: `packages/ghostty-electron/native/ghostty_bridge.mm`, `packages/ghostty-electron/src/terminal-manager.ts`, `apps/desktop/src/main/terminal-manager.ts`, `apps/desktop/src/main/ipc/terminal-editor.ts`, `apps/desktop/src/preload/index.ts`

### Native-view work still scales with visible native panes

- Reconcile still walks the active workspace split tree and active tabs to build the desired visible terminal and browser sets.
- Visible-bounds sync still iterates the currently observed visible native elements each pass.
- Hidden retained terminals still exist outside the visible set, so visibility wins do not solve the retention problem.

Relevant files: `apps/desktop/src/renderer/store/native-view-store.ts`, `apps/desktop/src/main/browser/browser-pane-view-lifecycle.ts`, `packages/ghostty-electron/native/ghostty_bridge.mm`

### Terminal cwd updates still touch broader persisted workspace state

- A real terminal cwd change still updates both the pane config and the owning workspace's `lastTerminalCwd` fallback.
- Both `panes` and `workspaces` are part of the persisted workspace snapshot.

Relevant files: `apps/desktop/src/renderer/hooks/useTerminalEvents.ts`, `apps/desktop/src/renderer/store/slices/pane-management.ts`, `apps/desktop/src/renderer/store/persistence.ts`

### Some settings persistence paths still deserve profiling

- The settings store is still a persisted Zustand store, and immediate controls such as toggles and segmented controls still write through it on click.
- These are no longer blind first-priority targets, but they remain worth revisiting if interaction profiling still points there.

Relevant files: `apps/desktop/src/renderer/store/settings-store.ts`, `apps/desktop/src/renderer/components/SettingsPage.tsx`, `apps/desktop/src/renderer/components/Sidebar/QuickLaunchGrid.tsx`

## Recommended Order

1. Re-run repeatable stress scenarios and capture baselines with the new main/renderer instrumentation before making deeper changes.
2. Expand the measurement surface only where the current snapshots still leave ambiguity, especially around renderer memory and long-run leak detection.
3. Revisit active-workspace hidden-terminal retention only if measurements still show meaningful memory pressure after the inactive-workspace eviction pass.
4. Revisit native-view batching or bounds work only if tab-switch, overlay, or resize profiling still points there.
5. Revisit settings-store writes only if user-interaction profiling still shows them hot.
6. Revisit extra terminal event batching only if bursty workloads still show queue pressure.
