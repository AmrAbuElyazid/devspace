# Changelog

This project keeps a lightweight, human-written changelog for tagged releases.

## Unreleased

- No unreleased notes yet.

## v0.2.1 - 2026-07-28

### Summary

- Fix two regressions from v0.2.0: switching workspaces or tabs could leave two panes flip-flopping between each other until the app was unusable, and sustained use drove the window server and the system cursor service to pegged CPU. Both scale with the retained-surface budget v0.2.0 introduced, so they got worse the longer Devspace stayed open.

### Highlights

**Switching**

- Fixed switching a workspace or tab flip-flopping between two panes at IPC speed and never settling. Native surfaces notify the renderer when they gain focus, including for focus the renderer itself requested; when the active tab moved on in between, acting on that echo dragged the selection back, which re-armed the previous pane and started the cycle over. A notification naming a pane that is not on screen cannot have come from a click, so it is now discarded. Measured over a four-second idle window after a burst of switching: 964 reconciles and 241 focus requests before, none of either after.
- Fixed the workspace focus sync comparing against a state snapshot taken before its own writes, so the group and tab checks ran against stale values.
- Re-activating the tab that is already active no longer replaces the pane-group map, which was waking every workspace-store subscriber for nothing.

**Performance**

- Fixed hidden background terminals driving the process-wide mouse cursor. Every cursor change round-trips to the window server, and Devspace keeps terminals alive and rendering off screen; cursor shape now comes only from a surface that is actually visible, and hiding the pointer only from the one taking keystrokes.
- Fixed unbalanced cursor hide and unhide calls, which are reference counted and could leave the pointer stuck invisible or spin the cursor service.
- Fixed a bounds update that changed nothing still forcing a layout pass, tracking-area rebuild and repaint — for every retained surface, several times a second — and fixed tracking areas being rebuilt on every layout pass rather than once.

## v0.2.0 - 2026-07-28

### Summary

- Move terminals onto a managed tmux backend so shells survive pane teardown, and fix the drag-and-drop, layout, and persistence defects that surfaced alongside it. A minor rather than a patch release: the terminal backend is new, and pane lifecycle changed with it.

### Highlights

**Terminals**

- Terminal sessions now run under a private tmux server and outlive the panes attached to them. A session is killed only when the workspace, tab, or pane is explicitly removed — switching workspaces or letting a pane fall out of the warm-surface budget leaves a running dev server alone. External tmux sessions are never touched.
- Fixed a close notification from a replaced surface being able to destroy its replacement, killing a live shell and everything under it. An epoch now travels with the notification through every async hop, and a close naming an older incarnation is dropped.
- Fixed every managed terminal tab being named after the machine's hostname. Tab titles are derived from the pane instead — the current directory at a prompt, the running command otherwise — and existing sessions started by an older build are healed in place rather than keeping the old format forever.
- Fixed new tabs inheriting a stale directory. tmux consumes the escape sequence a shell uses to announce its directory, so the working directory is now read from tmux and fed into the same pipeline, and directory inheritance works again.
- Fixed workspace restore spawning redundant tmux probes — one per managed pane, all in the same tick — by sharing the in-flight readiness check.

**Drag and drop**

- Fixed dropping a tab to create a split laying out at the wrong size and position when the split changed direction.
- Fixed drags being swallowed, freezing mid-drag, or never starting. Native terminal and browser/editor views sit above the renderer and consume the pointer events a drag depends on; they are now hidden on the first pointer movement, before the drag threshold is reached.
- Fixed drops landing on the wrong edge once the tab bar auto-scrolled, and drops being lost when the final pointer movement never arrived.
- Fixed a drag left stuck after the pointer was released outside the window, over a native pane, or while the window lost focus.
- Fixed the sidebar resize divider staying stuck in resize mode when released over a terminal.

**Layout and persistence**

- Split proportions are stored as percentages, so they survive restructuring and a window resize no longer rewrites the layout tree or emits a persistence patch per frame.
- Fixed a persisted workspace that failed validation being cached anyway, which silently prevented every later change in that session from being saved.
- Reduced the cost of a workspace patch from 112µs to 62µs, measured through the IPC handler on a 10-workspace / 60-group / 240-pane state over 2000 iterations.

**Editor and embedded panes**

- Fixed a routine superseded start showing a "Failed to start" card, and fixed panes that were left spinning forever after a rejected start.
- Fixed an evicted inactive editor view immediately rebuilding itself, undoing the eviction. Restarts now wait until the pane is back on screen.

**Other**

- Fixed the Option key being dropped from key bindings that carry it (#3).
- Fixed native panes recovering from blank states.

## v0.1.6 - 2026-05-05

### Summary

- Ship a focused patch release for VS Code editor pane zoom shortcuts.

### Highlights

- Fixed embedded VS Code panes so `Cmd+-`, `Cmd+=`, and `Cmd+0` route through Devspace webview zoom handling while preserving VS Code ownership of other editor shortcuts.

## v0.1.5 - 2026-04-30

### Summary

- Publish a follow-up patch release for validating the public auto-update flow from `v0.1.4`.

### Highlights

- Keeps the app behavior unchanged while advancing the version for update-feed testing.

## v0.1.4 - 2026-04-29

### Summary

- Recover the public-feed test release after the `v0.1.2` packaged smoke run exposed a missing app-shell readiness marker.

### Highlights

- Restored the `.app-shell` renderer marker used by packaged Playwright smoke tests.
- Keeps the release small so it can be used as the first successful public-feed update-test build.

## v0.1.3 - 2026-04-29

### Summary

- Provide the second small public-feed update test release for validating update discovery and install from `v0.1.2`.

### Highlights

- No user-facing changes beyond the version bump; this release exists to validate the public updater feed path.

## v0.1.2 - 2026-04-29

### Summary

- Prepare a small public-feed update test release after hardening the repo for public source access.

### Highlights

- Hardened Electron IPC trust boundaries, privileged IPC input validation, and `ghostty-electron` native bridge safety.
- Cleaned public-readiness docs, roadmap, contributor scaffolding, and intentional test log noise.

## v0.1.1 - 2026-04-26

### Summary

- Improve the desktop update experience after the first release by adding clearer updater UI states, changelog-driven release publishing, and a safe manual-download fallback for private GitHub releases.

### Highlights

- Added a sidebar update button above Settings, plus shared renderer update state wiring and mock update states for testing updater UI flows in development.
- Fixed release publishing reruns to reuse the existing GitHub release and publish notes directly from `CHANGELOG.md`.
- Replaced the raw private GitHub updater auth error with a user-facing manual-download message and fixed long update messages to wrap cleanly in Settings.

## v0.1.0 - 2026-04-26

### Summary

- Ship the first public-ready macOS desktop release path with signed and notarized artifacts, GitHub Releases publishing, and packaged auto-update wiring.

### Highlights

- Added the packaged desktop updater flow, GitHub provider metadata, and updater UI wiring through main, preload, renderer, and menu.
- Added a tagged macOS release workflow that verifies the repo, builds signed/notarized artifacts, smoke-tests the packaged app, and publishes release assets.
- Finalized release packaging basics including DMG and ZIP outputs, release metadata, and the desktop app icon.

## Format

For each release, add a new section at the top using this shape:

```md
## vX.Y.Z - YYYY-MM-DD

### Summary

- One short paragraph or 1-3 bullets covering the why.

### Highlights

- User-visible change or fix.
- Important internal change if it affects release risk.
- Follow-up note for migrations, rebuilds, or caveats when needed.
```

Older releases were not backfilled.
