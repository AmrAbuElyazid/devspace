# Performance Audit

**Purpose:** capture the current performance hotspots discussed during the Ghostty/native terminal and renderer audit, ordered by priority so future profiling and optimization work has one reference point.

## Summary

Devspace's biggest performance risks are not centered on one bad library choice. The main pressure points are:

- full-snapshot workspace persistence on the Electron main thread
- retained hidden Ghostty terminal surfaces and their memory footprint
- chatty native-to-main-to-renderer event flow
- visibility and resize work that scales with retained native surfaces
- a few renderer hot paths that rerender or persist more often than they need to

Zustand is not the main bottleneck. The bigger costs come from state shape, persistence wiring, native surface retention, and broad UI invalidation in a few hot paths.

## Prioritized Findings

### 1. Full-snapshot workspace persistence rewrites too much state

- Priority: highest
- Why it matters: any persisted change currently saves the full workspace snapshot, then the main process rewrites the full SQLite state synchronously. As workspace count, pane count, and terminal churn grow, save cost grows with total app state instead of the size of the change.
- Current behavior:
  - renderer persistence watches `workspaces`, `activeWorkspaceId`, `pinnedSidebarNodes`, `sidebarTree`, `panes`, and `paneGroups`
  - after debounce, the main process receives the whole snapshot
  - SQLite save deletes and reinserts all rows for panes, groups, tabs, workspaces, and metadata inside one transaction
- Main costs:
  - write amplification
  - main-thread blocking in Electron
  - noisy terminal-driven updates can participate in the same persistence path
- Recommended direction:
  - collapse queued saves so only the latest pending snapshot is written
  - move from full rewrite to incremental `UPSERT` and targeted deletes
  - consider slower persistence for noisy fields like `lastTerminalCwd`
- Relevant files: `apps/desktop/src/renderer/store/persistence.ts`, `apps/desktop/src/main/ipc/workspace-state.ts`, `apps/desktop/src/main/workspace-persistence-store.ts`

### 2. Hidden terminal panes stay alive and keep memory resident

- Priority: highest
- Why it matters: Devspace creates one Ghostty surface per terminal pane and keeps it alive until explicit destroy. Hidden tabs and hidden workspaces still retain native surfaces, memory, and usually the child shell process.
- Current behavior:
  - terminal panes create native surfaces once per `paneId`
  - surfaces survive remounts and workspace switches
  - non-visible surfaces are hidden, not destroyed
- Main costs:
  - memory scales with total terminal pane count, not visible pane count
  - more retained native views and GPU-backed surfaces in the window hierarchy
  - user workloads inside those shells also continue to consume resources
- Recommended direction:
  - keep current behavior as the default if session continuity is the priority
  - optionally add a memory-saving mode that destroys long-hidden terminals
  - if Ghostty/libghostty later supports a stronger detach-and-restore model, revisit terminal hibernation
- Relevant files: `apps/desktop/src/renderer/components/TerminalPane.tsx`, `apps/desktop/src/renderer/lib/terminal-surface-session.ts`, `packages/ghostty-electron/native/ghostty_bridge.mm`

### 3. Native terminal events are forwarded too eagerly across process boundaries

- Priority: high
- Why it matters: Ghostty native callbacks for title, cwd, search, focus, and close are forwarded individually from native code to the main process and then to the renderer. Under noisy terminals, this can create avoidable CPU and queue pressure.
- Current behavior:
  - native wakeups schedule ticks without coalescing
  - callback queues are unbounded
  - events are forwarded one by one through Electron IPC
- Main costs:
  - extra CPU overhead per event
  - possible queue buildup if the renderer is busy
  - more work than a simpler single-process terminal architecture
- Recommended direction:
  - coalesce native wakeups behind a pending-tick flag
  - suppress duplicate title and cwd updates before forwarding
  - batch or debounce high-frequency events where lossless delivery is not required
  - consider tighter queue bounds for best-effort UI notifications
- Relevant files: `packages/ghostty-electron/native/ghostty_bridge.mm`, `apps/desktop/src/main/ipc/terminal-editor.ts`, `apps/desktop/src/renderer/hooks/useTerminalEvents.ts`

### 4. Visibility and resize work scale with retained native surfaces

- Priority: high
- Why it matters: native visibility updates and some native refit paths still iterate all retained surfaces. As hidden terminal count grows, tab switches, workspace switches, overlay transitions, and resize handling get more expensive.
- Current behavior:
  - renderer computes desired visible surfaces for the active workspace
  - native `setVisibleSurfaces` walks the full retained surface map
  - native resize and move handling can refit every stored surface
- Main costs:
  - switch and resize cost grows with total retained surface count
  - repeated layout and visibility work when only a few surfaces changed
- Recommended direction:
  - track native visibility as a diff, not a full replacement pass
  - remove window-move refit if it is not actually needed
  - batch bounds updates and skip duplicate no-op frame applications
- Relevant files: `apps/desktop/src/renderer/store/native-view-store.ts`, `packages/ghostty-electron/native/ghostty_bridge.mm`

### 5. Terminal cwd updates fan out into more store work than needed

- Priority: medium-high
- Why it matters: a terminal `cwd` change updates pane config, scans workspace ownership, updates workspace-level cwd fallback state, and can cascade into sidebar metadata and persistence.
- Current behavior:
  - cwd changes enter through terminal event handling
  - the store scans workspaces and groups to find which workspace owns the terminal pane
  - the workspace gets a `lastTerminalCwd` update
- Main costs:
  - repeated graph scans
  - broader state invalidation than a simple per-pane field update
  - extra persistence traffic when cwd changes frequently
- Recommended direction:
  - maintain a `paneId -> workspaceId/groupId` ownership index
  - update that index when tabs move between groups or workspaces
  - debounce persistence of workspace cwd fallback state
- Relevant files: `apps/desktop/src/renderer/hooks/useTerminalEvents.ts`, `apps/desktop/src/renderer/store/slices/pane-management.ts`, workspace move/split slices under `apps/desktop/src/renderer/store/slices/`

### 6. Settings persistence is too eager for resize and text-entry paths

- Priority: medium
- Why it matters: settings use persisted Zustand state, and some updates happen on every mousemove or keystroke. The sidebar resize path is the clearest example.
- Current behavior:
  - sidebar width is updated on each `mousemove`
  - several settings text and number inputs persist on every change
- Main costs:
  - repeated local persistence writes during drag and typing
  - unnecessary rerenders tied to hot interaction loops
- Recommended direction:
  - keep temporary sidebar width local during drag, commit once on mouseup
  - debounce text and number setting persistence or commit on blur
  - keep hot transient UI state separate from persisted settings state
- Relevant files: `apps/desktop/src/renderer/store/settings-store.ts`, `apps/desktop/src/renderer/components/Sidebar/Sidebar.tsx`, `apps/desktop/src/renderer/components/SettingsPage.tsx`

### 7. Drag-and-drop hot state is broadcast through React Context

- Priority: medium
- Why it matters: drag state changes on pointer movement, and the current top-level context invalidates a broad part of the tree. That means many pane groups, tab bars, and sidebar sections rerender even when only one drop target actually changed.
- Current behavior:
  - `activeDrag` and `dropIntent` live in React state inside the drag orchestrator
  - they are exposed through a top-level `DragContext.Provider`
  - consumers across pane groups, tab bars, and the sidebar rerender when the provider value changes
- Main costs:
  - broad rerender fan-out during drag
  - reduced drag smoothness as workspace and sidebar complexity grow
- Recommended direction:
  - move hot drag state to a selector-based store, such as a small dedicated Zustand store
  - expose narrow derived selectors like split preview side, tab insert index, or sidebar insertion state
  - suppress redundant `dropIntent` updates when the semantic target did not change
- Relevant files: `apps/desktop/src/renderer/hooks/useDndOrchestrator.ts`, `apps/desktop/src/renderer/App.tsx`, `apps/desktop/src/renderer/components/PaneGroupContainer.tsx`, `apps/desktop/src/renderer/components/GroupTabBar.tsx`, `apps/desktop/src/renderer/components/Sidebar/Sidebar.tsx`

### 8. Sidebar workspace metadata is recomputed by rescanning workspace structure

- Priority: low-medium
- Why it matters: each workspace item derives metadata by scanning groups and panes. This is reasonable at small scale, but it becomes extra churn when pane state updates frequently.
- Current behavior:
  - workspace item selectors derive metadata by scanning the workspace tree and pane map
  - metadata includes pane count, primary directory, and relative last-active time
- Main costs:
  - repeated selector work across many sidebar items
  - extra sidebar churn when terminal and pane state update often
- Recommended direction:
  - precompute per-workspace sidebar metadata in the store or through memoized selectors
  - key recomputation to the specific workspace and pane fields that affect metadata
- Relevant files: `apps/desktop/src/renderer/components/Sidebar/SortableWorkspaceItem.tsx`, `apps/desktop/src/renderer/components/Sidebar/sidebar-utils.ts`

## State Management Notes

- Zustand is not the primary performance problem in this codebase.
- The main issues are broad invalidation, eager persistence, and expensive derived work on top of store updates.
- There are still a few Zustand usage improvements worth making:
  - avoid whole-store subscriptions like `useSettingsStore()` without a selector in hot components
  - move very hot transient drag state out of broad React Context and into a selector-based store
  - keep persisted cold state separate from hot interactive state where possible

## Measurement Gaps

Current repo coverage is stronger on throughput benchmarking and native-view lifecycle checks than on actual memory and CPU telemetry.

- Existing coverage:
  - `BENCHMARKS.md` documents terminal throughput results and benchmark setup
  - `scripts/terminal-bench.sh` and `scripts/terminal-stress.sh` provide manual workloads
  - `apps/desktop/e2e/mixed-workspace-stress.spec.ts` validates native-view lifecycle behavior
- Missing coverage:
  - app memory by process
  - main/renderer/GPU CPU usage
  - per-terminal memory growth
  - resize latency and frame pacing
  - long-run leak detection
- Recommended direction:
  - add `app.getAppMetrics()` and process memory sampling in the main process
  - capture measurements around terminal create, show, hide, resize, and destroy
  - continue using macOS Activity Monitor and Instruments for native memory and CPU validation

## Suggested Execution Order

1. Rework workspace persistence so saves stop rewriting the full world.
2. Add measurement and instrumentation for memory, CPU, and terminal lifecycle cost.
3. Coalesce native Ghostty wakeups and high-frequency terminal event forwarding.
4. Change native visibility handling from full replacement passes to diff-based updates.
5. Add pane ownership indexing so cwd updates stop scanning the workspace graph.
6. Debounce or delay persisted settings writes for sidebar resize and text entry.
7. Move drag hot state out of React Context into a selector-based store.
8. Precompute or memoize sidebar metadata.

## Persistence Follow-up Phases

### Phase 1

- keep incremental row-level persistence instead of full snapshot rewrites
- use `INSERT ... ON CONFLICT DO UPDATE` and targeted deletes as the default write pattern
- wrap multi-step logical writes in explicit transactions scoped to one operation
- fix hot settings writes first:
  - keep sidebar width local during drag
  - debounce text and number setting persistence
  - commit settled values instead of persisting every interaction tick

### Phase 2

- add a real migration system for the workspace SQLite DB instead of only schema bootstrap plus `SCHEMA_VERSION`
- keep persistence shaped around durable domain data, not transient renderer or UI state

### Phase 3

- split persistence by domain area over time:
  - workspaces
  - panes
  - pane groups and tabs
  - sidebar tree and metadata
- cache prepared statements if the persistence layer grows more query-heavy

### Phase 4

- add indexes only when a real query path needs them
- measure first, then add indexes for actual reads and lookups

### Phase 5

- move cold, low-frequency desktop settings to atomic main-process file persistence where it makes sense
- use temp-file-plus-rename writes for those settings
- keep hot and transient UI state out of that path

## Persistence Non-goals

- do not copy `t3code`'s event-sourcing or projection architecture
- do not adopt its heavier Effect and SQL abstraction unless Devspace persistence becomes much more complex
