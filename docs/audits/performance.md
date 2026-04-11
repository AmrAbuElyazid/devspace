# Performance Audit

**Purpose:** capture the current performance hotspots discussed during the Ghostty/native terminal and renderer audit, ordered by priority so future profiling and optimization work has one reference point.

## Summary

Devspace's biggest performance risks are not centered on one bad library choice. The main remaining pressure points are:

- broad workspace persistence that still runs on the Electron main thread
- retained hidden Ghostty terminal surfaces and their memory footprint
- remaining native-view visibility and resize churn that still shows up under profiling
- a few renderer hot paths that rerender or persist more often than they need to
- limited direct measurement for CPU, memory, and frame pacing regressions

Zustand is not the main bottleneck. The bigger costs come from state shape, persistence wiring, native surface retention, and broad UI invalidation in a few hot paths.

## Prioritized Findings

### 1. Workspace persistence is much cheaper, but still broad and main-thread bound

- Priority: highest
- Why it matters: persistence is no longer doing full world rewrites, but it still snapshots a broad slice of workspace state and applies writes on the Electron main thread. As workspace count, pane count, and terminal churn grow, save cost can still scale with the breadth of persisted state.
- Current behavior:
  - renderer persistence watches `workspaces`, `activeWorkspaceId`, `pinnedSidebarNodes`, `sidebarTree`, `panes`, and `paneGroups`
  - after debounce, the main process receives the whole snapshot
  - SQLite save now prepares a snapshot diff and applies incremental `UPSERT`/targeted delete work inside one transaction instead of deleting and reinserting every row
- Main costs:
  - snapshot prep and persistence still run on the main thread
  - noisy terminal-driven updates can still participate in the same persistence path
  - broad persistence subscriptions still mean unrelated-looking churn can share the same save boundary
- Recommended direction:
  - keep queued saves collapsed so only the latest pending snapshot is written
  - consider slower persistence or narrower dirty tracking for noisy fields like `lastTerminalCwd` if profiling still points there
  - keep measuring main-thread save time before adding more persistence complexity
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

### 3. Native terminal events are cheaper than before, but still cross process boundaries one by one

- Priority: high
- Why it matters: Ghostty native callbacks for title, cwd, search, focus, and close are forwarded individually from native code to the main process and then to the renderer. Under noisy terminals, this can create avoidable CPU and queue pressure.
- Current behavior:
  - native wakeups are coalesced behind pending-tick scheduling
  - duplicate title and cwd updates are suppressed before they trigger broader store work
  - events still cross native -> main -> renderer one by one through Electron IPC
- Main costs:
  - extra CPU overhead per event
  - possible queue buildup if the renderer is busy
  - more work than a simpler single-process terminal architecture
- Recommended direction:
  - keep the current wakeup and duplicate suppression as the baseline
  - batch or debounce only the high-frequency events that still show up as hot under profiling
  - consider tighter queue bounds for best-effort UI notifications
- Relevant files: `packages/ghostty-electron/native/ghostty_bridge.mm`, `apps/desktop/src/main/ipc/terminal-editor.ts`, `apps/desktop/src/renderer/hooks/useTerminalEvents.ts`

### 4. Native-view churn is smaller now, but still the highest-leverage remaining visibility path

- Priority: high
- Why it matters: the worst full-registry passes are gone, but native-view visibility, bounds, and refit work are still the most likely remaining source of tab-switch, overlay, and resize overhead if profiling shows a problem.
- Current behavior:
  - renderer and main-process visibility updates for terminal and browser panes are now diff-based rather than unconditional full replacement scans
  - native terminal resize refits skip window-move notifications, skip unchanged content heights, and only touch desired-visible surfaces
  - terminal and browser bounds application now skip duplicate no-op frame and `setBounds` writes, and renderer listener/scheduling paths also coalesce several empty or duplicate cases
- Main costs:
  - hidden terminals still exist and still drive retained-surface scale and memory
  - switch and resize work still grows with the visible native set even though several no-op paths are gone
  - remaining costs are now harder to reason about without direct measurement
- Recommended direction:
  - keep profiling actual tab-switch, overlay, and resize behavior before adding more complexity
  - if needed, add more targeted instrumentation or batching around visible-set transitions and bounds delivery
  - keep browser and terminal visibility semantics aligned as the native-view stack evolves
- Relevant files: `apps/desktop/src/renderer/store/native-view-store.ts`, `packages/ghostty-electron/native/ghostty_bridge.mm`

### 5. Terminal cwd updates fan out less than before, but can still touch broader persisted state

- Priority: medium-high
- Why it matters: a terminal `cwd` change still updates pane config, workspace-level cwd fallback state, and related derived data, so noisy shells can still create broader store and persistence work than a purely local terminal field.
- Current behavior:
  - cwd changes enter through terminal event handling
  - the owning workspace gets a `lastTerminalCwd` update
- Main costs:
  - cwd churn can still trigger broader pane/workspace updates than a purely local terminal field
  - extra persistence traffic remains possible when cwd changes frequently
- Recommended direction:
  - keep ownership indexing as the baseline
  - debounce persistence of workspace cwd fallback state if cwd-heavy workloads still show up in profiling
  - measure real cwd event frequency before adding more special-case logic
- Relevant files: `apps/desktop/src/renderer/hooks/useTerminalEvents.ts`, `apps/desktop/src/renderer/store/slices/pane-management.ts`, workspace move/split slices under `apps/desktop/src/renderer/store/slices/`

### 6. Settings persistence is better on resize, but still eager for some text-entry and number-input paths

- Priority: medium
- Why it matters: settings use persisted Zustand state, and some updates still happen on every keystroke or stepper interaction, which keeps persistence and rerender work on hot UI paths.
- Current behavior:
  - several settings text and number inputs still persist on every change
- Main costs:
  - repeated local persistence writes during typing and number stepping
  - unnecessary rerenders tied to those hot interaction loops
- Recommended direction:
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
  - broad rerender fan-out during drag still remains possible, even though redundant updates are reduced
  - reduced drag smoothness as workspace and sidebar complexity grow
- Recommended direction:
  - move the remaining hot drag state to a selector-based store if profiling still shows context churn
  - expose narrow derived selectors like split preview side, tab insert index, or sidebar insertion state
  - keep semantic `dropIntent` dedupe in place and extend it if other drag signals still churn
- Relevant files: `apps/desktop/src/renderer/hooks/useDndOrchestrator.ts`, `apps/desktop/src/renderer/App.tsx`, `apps/desktop/src/renderer/components/PaneGroupContainer.tsx`, `apps/desktop/src/renderer/components/GroupTabBar.tsx`, `apps/desktop/src/renderer/components/Sidebar/Sidebar.tsx`

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

1. Add measurement and instrumentation for memory, CPU, resize latency, and native-view lifecycle cost.
2. Revisit hidden-terminal memory strategy only if real workloads show retention pressure.
3. Continue profiling native-view visibility and bounds churn before adding more complexity.
4. Debounce or delay the remaining persisted settings text and number writes.
5. Move drag hot state out of React Context only if drag profiling still shows broad invalidation.
6. Revisit extra terminal event batching only if bursty workloads still show queue pressure.

## Persistence Follow-up Phases

### Phase 1

- keep incremental row-level persistence as the default instead of falling back to broad rewrites
- keep `INSERT ... ON CONFLICT DO UPDATE` and targeted deletes as the default write pattern
- wrap multi-step logical writes in explicit transactions scoped to one operation
- finish the remaining hot settings follow-up:
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
