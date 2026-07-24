# Performance Audit

Status: implementation and runtime verification complete
Last updated: 2026-07-24

## Summary

The original unbounded-retention paths are now separated by ownership. Managed
terminal processes survive in a private tmux server while disposable Ghostty
clients are bounded. Browser, VS Code, and T3 WebContents views are also bounded
without interpreting visibility as permission to stop user work. Tab selection
keeps a small warm set of React controllers instead of remounting the active
pane on every switch.

Workspace persistence now sends identity-based entity patches rather than a
full graph for ordinary changes. The main process validates the merged graph,
reuses prepared rows for unchanged entities, applies incremental SQLite writes,
and checkpoints its WAL. A synchronous full snapshot remains only as the
shutdown fallback.

## Implemented

### Durable terminal ownership

- New terminals default to `managed-tmux`; existing terminal records without a
  backend remain backwards-compatible direct PTYs.
- One Devspace terminal pane maps to one tmux session. Devspace UI state remains
  the source of truth for tabs and splits.
- Managed tmux uses a pinned bundled binary, an explicit private socket under
  app data, a private configuration, and an environment with inherited `TMUX`
  variables removed. The user's default tmux server and configuration are not
  touched.
- Direct PTYs are never automatically destroyed. Managed and external tmux
  clients can be detached because their process lifetime is independently
  owned.
- Closing a managed tab leaves its session recoverable in Settings. Killing the
  session requires a separate confirmed user action.
- Settings exposes direct mode and explicit attachment to a user-owned tmux
  session/socket. External sessions are never garbage-collected by Devspace.
- A surviving private server is queried for its tmux version before use. A
  client/server mismatch fails without restarting or killing the old server.

Relevant files: `apps/desktop/src/main/managed-tmux.ts`,
`apps/desktop/src/main/terminal-manager.ts`,
`apps/desktop/src/renderer/lib/terminal-surface-session.ts`,
`apps/desktop/src/renderer/components/SettingsPage.tsx`,
`packages/ghostty-electron/native/ghostty_bridge.mm`

### Bounded heavyweight views

- Visible managed terminals plus at most six inactive persistent terminal
  clients are retained. Older clients detach; their tmux sessions and child
  processes continue running.
- Direct terminal surfaces are excluded from automatic eviction.
- At most two inactive ordinary browser WebContents views remain warm.
- At most one inactive embedded VS Code/T3 WebContents view remains warm.
  Eviction destroys only the view. The owned server/session registration is
  retained, and reactivation recreates the view idempotently without increasing
  its reference count.
- Asynchronous terminal/editor/T3 creation uses generations so a close racing a
  start cannot resurrect a stale view or leak a server reference.
- Each pane group retains at most six recently used React tab layers. This
  avoids immediate controller remounts during ordinary switching while bounding
  inactive React editors.
- Per-pane terminal search state, browser runtime state, and removed-group tab
  history are deleted with their owners.

Relevant files: `apps/desktop/src/renderer/lib/browser-pane-session.ts`,
`apps/desktop/src/renderer/lib/embedded-tool-view-session.ts`,
`apps/desktop/src/renderer/components/PaneGroupContent.tsx`,
`apps/desktop/src/main/ipc/terminal-editor.ts`

### Tab, split, and drag behavior

- Sortable tab transforms and transitions are applied to the rendered tab.
- Active drag state is selected once at the bar rather than subscribed to by
  every tab; stable child callbacks reduce fan-out.
- Split layout keys no longer derive from the entire tree or child indexes, so
  unrelated topology edits do not remount the whole layout.
- Recently active pane controllers remain mounted within the documented warm
  budget.

Relevant files: `apps/desktop/src/renderer/components/GroupTabBar.tsx`,
`apps/desktop/src/renderer/components/SplitLayout.tsx`,
`apps/desktop/src/renderer/components/PaneGroupContent.tsx`

### Persistence and cache behavior

- Browser panes created without a URL persist `about:blank`; all pane factories
  now emit type-valid defaults.
- Ordinary workspace saves carry only changed/new/removed workspace, pane, and
  group entities plus changed scalar/sidebar fields.
- Patch application is atomic: untrusted IPC shape is bounded first, then the
  resulting full workspace graph is validated before SQLite is touched.
- Unchanged objects reuse prepared JSON rows, avoiding repeated serialization.
- SQLite WAL checkpoints periodically and truncates on clean shutdown.
- Browser cache usage is measurable on demand in Settings. Cache clearing stays
  explicit and confirmed; Devspace does not delete user browser data because a
  size threshold was crossed.

Relevant files: `apps/desktop/src/renderer/store/persistence.ts`,
`apps/desktop/src/main/ipc/workspace-state.ts`,
`apps/desktop/src/main/workspace-persistence-store.ts`,
`apps/desktop/src/renderer/components/browser/BrowserImportPanel.tsx`

### Helper process ownership

- VS Code serve-web processes use a versioned ownership record and a dedicated
  process group.
- Stale reconciliation requires the exact Devspace host, port, base path,
  token file, and server-data path. A reused or unrelated PID is never killed.
- Stop targets a verified owned process group or exact verified processes.

Relevant files: `apps/desktop/src/main/vscode-server.ts`

### Measurement and stress coverage

- Renderer native-view counters expose registered/visible counts, reconcile and
  bounds work, and focus requests.
- Main snapshots expose process and Electron child-process memory/CPU plus
  terminal/browser operation timings.
- Hidden-terminal stress asserts the managed client bound while proving all
  private tmux sessions remain alive.
- A 50-mixed-pane stress scenario reorders tabs, splits a group, waits for
  persistence, reloads the renderer, and compares the exact pane order and
  topology.

Relevant files: `apps/desktop/src/renderer/store/native-view-store.ts`,
`apps/desktop/src/main/performance-monitor.ts`,
`apps/desktop/e2e/hidden-terminal-retention.spec.ts`,
`apps/desktop/e2e/workspace-persistence-stress.spec.ts`

## Verification and remaining limits

- The final tree passes native addon rebuild, bundled-tmux checksum/load-path
  verification, production build, 97 test files, 735 unit/component tests, the
  three Electron stress scenarios, and full app-restart reattachment coverage.
- The hidden-terminal scenario retained all eight managed sessions while
  bounding inactive clients at six. Removing their workspace reclaimed about
  34 MB of resident memory in the reference run.
- A locally signed packaged app launched its default managed terminal using the
  bundled tmux runtime and shut down cleanly. Apple notarization upload remains
  blocked outside the repository by an expired or unsigned developer-account
  agreement (HTTP 403).
- Capture long-running RSS and interaction-latency baselines on real workloads;
  lifecycle count bounds prove ownership behavior but are not a substitute for
  hours-long leak measurement.
- Verify tmux true color, OSC title/CWD integration, clipboard, copy mode,
  scrollback, shell initialization, and full-screen TUI resizing manually in a
  signed app build.
- Direct PTYs necessarily retain their surface and process until explicitly
  closed. Users with many long-lived terminals should use managed mode; silent
  migration would replace the PTY and is intentionally not attempted.
- SQLite remains synchronous on the Electron main process. Patch and prepared
  row reuse greatly reduce ordinary work, but moving persistence to a worker is
  still an option if measured transaction latency remains material.
- Native terminal events still cross process layers individually after current
  duplicate suppression. Batch them only if burst profiling shows queue
  pressure.
