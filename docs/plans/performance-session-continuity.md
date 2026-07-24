# Performance, tabs, and terminal continuity plan

Status: implemented and verified
Last updated: 2026-07-24

## Why this work exists

Large Devspace workspaces currently retain too many heavyweight views, remount
pane trees during ordinary navigation, and persist some pane states
inconsistently. The visible results are growing RAM usage, degraded interaction
latency, unreliable tab arrangement, and orphaned helper processes.

The terminal fix must preserve running work. A hidden terminal may own a dev
server, watcher, database, or any other long-running process. Devspace must not
infer that a terminal is disposable from its visibility, CPU usage, foreground
process, command, or age.

## Non-negotiable invariants

1. Hiding, suspending, evicting, or closing a terminal view never kills its
   durable managed terminal session.
2. Managed terminal sessions are killed only by an explicit user action.
3. Direct-PTY terminals are never automatically destroyed because their view
   and process lifetime cannot be separated safely.
4. Devspace never guesses process importance from activity or process names.
5. Devspace's managed tmux server is isolated from the user's tmux server,
   sessions, configuration, plugins, key bindings, and socket.
6. User-owned tmux sessions are never renamed, killed, migrated, or garbage
   collected by Devspace.
7. Devspace tab and split state remains the source of truth for the interface;
   tmux is a terminal process-continuity engine, not the window manager.
8. Pane creation, rearrangement, splitting, and restart persistence may not
   silently lose valid state.

## Target architecture

Terminal state is separated into three lifetimes:

- **Pane record**: durable Devspace metadata such as pane ID, backend, title,
  working directory, and managed session ID.
- **Terminal session**: the shell, PTY, and child processes. For managed
  terminals this is one tmux session per Devspace terminal pane.
- **Surface view**: a Ghostty surface attached to a session. It is disposable
  and can be recreated without stopping the session.

Terminal panes use an explicit backend discriminator:

- `managed-tmux`: the default persistent mode once it is proven and shipped.
  It uses the Devspace-owned private tmux server.
- `direct`: compatibility mode using Ghostty's direct PTY. Its surface stays
  alive until the user closes the terminal.
- `external-tmux`: an explicit attach-to-user-session mode. The session is
  externally owned and Devspace only attaches and detaches clients.

### Private managed tmux server

Devspace will invoke a pinned, bundled tmux binary with an explicit socket in
the app-support directory and a Devspace-owned configuration. Every command
targets that socket, and launches clear inherited `TMUX` and `TMUX_PANE`
variables. A user who already runs tmux therefore has a completely separate
server namespace. Development builds may use an explicitly resolved host tmux
while the reproducible bundled artifact is prepared; production must not
silently depend on the host having tmux.

The private server survives an app or renderer crash, but reboot continuity is
out of scope. App updates must detect the running server version and avoid
connecting an incompatible client or destructively restarting sessions.

Managed configuration must preserve true color, OSC title and working-directory
reporting, shell integration, useful mouse/copy behavior, and bounded tmux
history. Devspace does not expose tmux status UI as its tab model.

### Surface lifecycle

Visible managed terminals have attached Ghostty surfaces. A bounded number of
recently used managed terminals remain warm for fast switching. Hidden surfaces
outside that budget may be detached and destroyed; their tmux sessions and all
child processes continue running. Memory pressure may shrink the warm budget,
but never kill a managed session.

On activation, Devspace recreates a surface and attaches it to the existing
managed session. Existing direct terminals cannot be migrated without replacing
their PTY, so managed mode applies to new terminals or an explicit user-approved
restart.

## Work phases

### 1. Persistence integrity

- Replace unsafe empty pane configs with type-specific defaults.
- Make every default browser pane persist a valid URL.
- Add cross-layer tests proving renderer-created states pass main-process
  validation and survive save/load.

### 2. Managed terminal foundation

- Add durable backend/session metadata with backwards-compatible migration.
- Add Ghostty per-surface command/argument support.
- Add a private tmux binary/socket/config resolver and process-safe command API.
- Create, attach, detach, inspect, and explicitly kill sessions by pane ID.
- Keep direct mode operational when managed tmux is unavailable or selected.

### 3. Bounded views and recovery

- Separate session existence from surface registration.
- Keep visible plus a small recent set warm; evict hidden managed views only.
- Reattach transparently when a pane becomes active.
- Reconcile pane records with managed sessions after app restart or crash.
- Expose detached/recoverable sessions rather than deleting ambiguous state.

### 4. Tabs, splits, and drag-and-drop

- Give split nodes stable identities so topology edits do not remount unrelated
  pane subtrees.
- Keep expensive pane controllers stable across ordinary tab selection.
- Localize drag state subscriptions and callbacks.
- Apply sortable transforms/transitions so tab movement is visible while
  dragging, including overflow auto-scroll and cross-group movement.

### 5. Helper-process ownership

- Give the VS Code server a verifiable Devspace ownership record and process
  group.
- Reconcile a stale PID only when its full command and expected paths prove
  ownership.
- Stop the verified owned process tree; never kill unrelated matching
  processes.

### 6. Persistence, cache, and renderer cleanup

- Replace broad full-state save work with incremental or identity-preserving
  persistence where measurement shows it is material.
- Bound/checkpoint persistence journals and expose cache usage without deleting
  user data unexpectedly.
- Remove stale per-pane renderer maps and dead navigation-history keys.
- Add measurements around terminal surfaces, renderer processes, persistence
  latency, and owned helper processes.

## Acceptance criteria

- Creating a browser pane without an explicit URL always persists and restores
  `about:blank` (or another documented valid default).
- A workspace with at least 50 mixed panes can reorder, split, save, restart,
  and restore without changing pane order or losing valid state.
- Destroying a managed terminal surface does not stop its foreground command,
  server, shell, or descendants; reactivation reattaches to the same session.
- A managed terminal survives Devspace renderer/app restart and remains
  recoverable while the private tmux server is alive.
- The user's default tmux server and sessions are byte-for-byte outside
  Devspace lifecycle operations.
- A direct-PTY terminal is never automatically evicted.
- Hidden managed terminals reach a bounded surface count and memory use
  plateaus relative to pane count, with the bound documented by a stress test.
- Tab dragging has visible movement and correct final order across overflow and
  pane groups without whole-bar rerender fan-out.
- Verified stale Devspace VS Code processes are reconciled; unrelated processes
  are untouched.
- `bun run fmt`, `bun run lint`, `bun run knip`, `bun run typecheck`, and
  `bun run test` pass, along with relevant native build, production build, and
  end-to-end stress scenarios.

## Outcomes and follow-up measurement

- tmux 3.4 and its arm64 runtime libraries are pinned, checksummed, licensed,
  load-path verified, signed with the application, and exercised by packaged
  smoke coverage. The user's installed tmux is neither required nor contacted
  by managed mode.
- A surviving private server is version-checked before session inspection,
  attachment, or deletion. A mismatch fails closed and leaves its sessions
  untouched.
- Settings exposes recoverable managed sessions, confirmed explicit deletion,
  direct PTYs, and opt-in attachment to a user-owned tmux socket/session.
- Continue measuring hours-long real workloads and tune warm budgets from RSS
  and interaction latency. The current limits are behaviorally bounded and do
  not terminate durable work.
- Manually exercise true color, clipboard, copy mode, OSC title/CWD behavior,
  shell initialization, scrollback, and full-screen TUI resizing on each
  supported macOS release before a public release.
