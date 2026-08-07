# Changelog

This project keeps a lightweight, human-written changelog for tagged releases.

## Unreleased

- No unreleased notes yet.

## v0.6.1 - 2026-08-07

### Summary

- A browser pane input release. Pinching the trackpad and pressing a mouse's thumb buttons both did nothing, for the same underlying reason: the gesture reaches the page, but the half that acts on it belongs to the browser UI wrapped around the web contents — which an Electron app does not inherit.

### Highlights

**Pinch to zoom**

- Pinching a browser pane magnifies it. Electron ships visual zoom switched off, so the gesture had nowhere to go. This is the magnifying kind rather than the ⌘+ kind: it scales what is already drawn and lets the page be panned around instead of laying it out again, and it leaves the page's own zoom alone. It stops at 3x, the same ceiling the zoom buttons use.
- Reset zoom returns a pinched page to life size as well as clearing the page zoom, so the badge and the page cannot disagree about what you are looking at.

**Mouse back and forward**

- The back and forward buttons on a mouse navigate a browser pane's history. They never arrive as buttons 4 and 5 on macOS: mouse software such as Logi Options and SensibleSideButtons converts them into the system's "swipe between pages" gesture, which is what makes them work in Safari and Finder and what left anything watching for mouse buttons seeing nothing at all. Both routes are handled, so a mouse that does send the raw buttons works too.

## v0.6.0 - 2026-08-06

### Summary

- A note editor release. The note pane stopped saving the first time you used a table, a callout or strikethrough, and lost every keystroke after it — silently. That is fixed, along with dragging, hover, images, find, and the layout. Notes are now portable GFM: tables, task lists, `> [!NOTE]` alerts, images and math all survive a round trip.

### Highlights

**Notes reach disk**

- The markdown layer was registered without GFM, so serializing threw the moment a note contained a table, strikethrough, underline, highlight, keyboard key or callout — every one of which the toolbar and the slash menu could insert. The pane discarded its cached markdown in response and never wrote again for the rest of its life. Reading was equally lossy: a table came back as a paragraph of pipes and `- [ ]` lost its checkbox. Notes are now written as GFM and the round trip is checked node by node.
- Callouts are stored as GitHub alert blockquotes rather than MDX carrying a freshly generated id on every keystroke, which had the file churning on disk forever. Empty paragraphs no longer write an invisible zero-width space into it, and opening a note no longer rewrites the file you only looked at.
- A failed serialization no longer poisons the pane. The last version that did serialize is kept and still written, instead of being thrown away along with everything typed after it.

**Editing**

- Blocks can be dragged. Four separate faults stood in the way: the handle doubled as its menu's trigger and the menu cancelled the gesture, the gutter sat outside the block's hover area, the press landed on the icon rather than the button, and an invisible overlay covered the top of the window and swallowed drops onto the first blocks of a note.
- Hover and keyboard selection in the slash menu and the floating toolbar do something again — they were painted with three custom properties that were never defined.
- A note ending in a code block, table or image can be typed under. Typing `- [ ] ` makes a checkbox. The "Turn into" submenu opens beside its menu instead of inside it.

**New**

- A block gutter with drag, insert and fold; a grouped slash menu; find and replace; a footer with save status, counts and reading time; an outline panel; collapsible headings; a code language picker and copy button; callout kinds; table row and column controls; images by paste or drop; math; and reveal, open-externally, export and switch-note.

**Appearance**

- The editor is laid out for a pane rather than a page: 13px body text, tighter rhythm, and padding that follows the pane's own width. Syntax highlighting is built from the workspace palette, so it tracks light and dark instead of being hard-coded to one theme.

### Notes

- Inline math uses `$$x$$`, not `$x$`. Developer notes are full of `$PATH`, `$1` and prices, and single-dollar parsing turns "costs $5 and saves $3" into an equation.
- Long notes are still slow — around 28ms per keystroke at 300 blocks — because every block is rendered. Unchanged from previous releases.

## v0.5.1 - 2026-08-06

### Summary

- A focus release. Panes that come back on screen by themselves — a dev server restarting under an agent's edits, a VS Code pane finishing its start — no longer pull Devspace in front of whatever you had switched to. Two first-run VS Code bugs and one persisted credential were fixed on the way.

### Highlights

**Focus**

- Devspace stays where you put it. Focusing a pane's web contents is not a pane-local operation on macOS: it activates the app and raises its window, and nothing checked whether Devspace was frontmost first. So every dev-server restart, and every VS Code pane that finished starting while you were elsewhere, yanked the screen back. Focus the app asks for on its own is now refused while the window is in the background; the pane gets the keyboard when you return to it instead.
- The same raise is closed off in the paths that hand the keyboard back to the window — releasing a terminal, closing a pane menu. A menu only returns focus to the parent if the parent had it when the menu opened.

**Embedded VS Code**

- The first-run download no longer stalls. `code serve-web` was spawned with a stdout pipe nothing ever read, and an unconsumed pipe blocks the writer once it fills — which the download, reporting its progress on stdout, does on its own.
- A slow first-run download is no longer killed and restarted from nothing. The flat 30s startup budget expired mid-download and tore down the process group it was waiting on. The wait now gives up on silence rather than elapsed time.

**Fixes**

- A VS Code pane's connection token is no longer written to the workspace state file. Editor pane URLs carry a live credential, and every committed navigation was being persisted with the rest of the pane's config. State files that already hold one are cleaned when they are next opened.

## v0.5.0 - 2026-08-05

### Summary

- A sidebar release. Rows are rebuilt around what actually tells two workspaces apart — an identity colour, the tail of the directory, and the port anything under them is serving on — and a collapsed sidebar now comes back on a left-edge hover, drawn over the terminals instead of pushing them aside.

### Highlights

**Sidebar**

- Every workspace carries a 2px identity colour of its own, chosen from an eight-hue palette or assigned automatically, and the active row is tinted with that hue rather than one shared amber. A row is recognisable before its name is read.
- Rows show the tail of their directory, truncated from the left. The end of a path is what distinguishes two sibling worktrees; the start of it is the same for all of them.
- A row shows a green dot and `:port` when something under one of its terminals is listening. Ports are found by scoping to each pane's own process subtree, so a chat client's bundled server is never attributed to whatever workspace happens to be open, and by asking the kernel rather than guessing from process names — which misfires on `tail -f` and misses anything not on a list. The scan runs when a pane's foreground command changes; sitting at a prompt costs nothing.
- Section headers line up with the rows they head. They were twelve pixels out on the left and nine on the right, with five different vertical gaps down the list.
- Workspaces and folders gained colour, duplication, and their menus; the divider's live width and the width that gets saved no longer disagree, so dragging past 400px stops snapping back twenty pixels on release.

**Hover to reveal**

- With the sidebar collapsed, the window's left edge brings it back over the panes, and moving away puts it away. Terminals stay exactly where they are — nothing is hidden to make room, and nothing reflows.
- It is the sidebar, not a menu: the same width, the same surface, hard against the same edge, the same sections and rows. It slides in and out rather than appearing.
- It never takes the keyboard. Clicking a workspace switches to it and leaves the terminal you were typing in still focused.

**Fixes**

- Resizing the sidebar no longer blanks every terminal and browser for the duration of the drag.
- Renaming from a context menu can now be typed into. The field was focused and the keystrokes still went to the terminal: a pane is a native view beside the web contents and had taken the window's keyboard, which the app had no way to notice.
- `devspace .` no longer breaks when a second instance is running. The auth token was written before its server had bound a port, so an instance that lost the race advertised its own token for a port another instance owned.

## v0.4.0 - 2026-08-04

### Summary

- A design-system pass and a browser overhaul. Browser tabs now carry the page's own title and favicon instead of all reading "Browser"; the toolbar has been cut from eleven controls to five; there is a responsive device mode with presets and draggable resize rails; and menus opened from a pane now draw over the page instead of hiding it.

### Highlights

**Browser**

- Added responsive device mode: device presets, a custom size, aspect-ratio lock, rotate, and draggable edge and corner rails with keyboard resizing. A frame larger than the pane scales down to fit while the page keeps laying out at the width you asked for, so media queries still fire at the breakpoint the device would actually hit — a viewport that quietly reflows to the pane is worse than no device mode at all.
- Rebuilt the toolbar around the address bar. The security state moved into the field as a lock glyph, secondary actions moved into an overflow menu, and the zoom level only appears when it is not 100%. The old row gave eleven controls equal weight, three of them zoom, and squeezed the one thing anyone aims at.
- Browser tabs take the page's title, falling back to the host while it loads, and show a loading spinner and then the site's favicon. Tabs previously sat on a generic "Browser" and a generic globe forever, which made a row of them unreadable.
- Renaming a tab by hand now sticks. Terminal tabs too: an OSC title sequence no longer overwrites a name you typed.
- A crashed browser pane reloads itself with backoff — three attempts per rolling 30 seconds — instead of going straight to a failure card. Most renderer crashes are transient and a reload fixes them.
- A new blank tab puts the caret in the address bar so it is typeable on arrival.

**Design**

- Floating surfaces are now glass: menus, dialogs and backdrops sample what is behind them, tuned separately per theme, with an opaque fallback for when the GPU process falls back to software rendering.
- Looping indicators are duty-cycled. A spinner that eases continuously asks the compositor for a frame every vsync for as long as it is on screen; a workspace with a few of them never let the GPU idle.
- Status colors gained readable foreground partners, the sidebar gained a subtle grain, long lists fade under their sticky headers, and theme switching no longer smears the window through an intermediate palette.
- Added reduced-motion and forced-colors passes. Reduced motion keeps a slow pulse on spinners rather than freezing them, since a frozen spinner is indistinguishable from a hung pane.

**Fixes**

- Tooltips in pane toolbars, find bars and the tab bar were invisible. They opened downward into a terminal or browser surface, which is an OS-level view composited above the app, so they were painted underneath it rather than merely clipped.
- Menus opened from a browser toolbar no longer blank the page. They are drawn in a transparent view stacked above the pane instead of the pane hiding itself for as long as the menu is open.
- Pressing Enter in the device-size fields applies the size. A field group with no submit button never receives implicit submission, so it silently did nothing.

## v0.3.1 - 2026-07-29

### Summary

- Fix new terminals dying with "missing or unsuitable terminal: xterm-256color" on Macs without Homebrew's ncurses installed. Terminals already open kept running, so the app looked healthy until you opened a new one. Present since v0.2.0 rather than new in v0.3.0, and reached by updating from v0.1.x, whose direct-PTY terminals never invoked tmux.

### Highlights

**Terminals**

- Fixed the bundled tmux being unable to find a terminfo database. It links Homebrew's ncurses, and that build carries exactly one compiled-in search path: the Cellar directory of whichever machine produced the bundle. That directory exists on a build machine and on almost no user's. ncurses does not consult the system database at `/usr/share/terminfo` unless it is named explicitly, and the terminfo Devspace ships holds only Ghostty's own entries — so a common `TERM` resolved nowhere and tmux exited before a shell appeared. The system database is now on the search path.
- Added the two checks that would have caught it. Everything in the test suite passed while this was broken, because it all runs on machines where the Homebrew path happens to exist; linker inspection could not see it either, since the path is a string compiled inside the library rather than a link. The bundle verifier now asserts the system database still carries what the tmux configuration depends on and that the search path still names it, and an end-to-end test asserts the search path itself rather than tmux merely succeeding.

## v0.3.0 - 2026-07-29

### Summary

- Rebuild the app chrome: a sidebar that drops its borders and gains multi-select and bulk actions, Settings as a modal you can close without reaching for the window's close button, and one source of truth for the macOS traffic lights. A minor rather than a patch release: the sidebar gains real features, and the chrome IPC changed with it.

### Highlights

**Window chrome**

- The macOS traffic lights are positioned from one place. Three components each ran their own fullscreen round-trip while the main process derived the native button position from a sidebar flag it was told about separately, so the buttons sat off-centre whenever the two disagreed. The renderer now reports the height of whichever bar owns the top-left corner and the main process centres the cluster inside it, clamping anything implausible.

**Settings**

- Settings is a centred card rather than a full-window page. Its only close affordance used to sit a few pixels from the native red traffic light, so people aimed for one and hit the other and quit the app. Dismissing it is now the header ✕, a Done button, a click outside, or Escape. The strip behind the title bar stays draggable so the window can still be moved while it is open.
- Settings takes keyboard focus when it opens, keeps Tab inside itself, and gives focus back on close. It claimed to be a modal before while Tab walked straight out into the application behind it.
- Added "Kill all" for detached managed tmux sessions, and replaced the blocking browser confirm on a single kill with the app's own dialog.

**Workspaces and folders**

- Workspaces and folders can be multi-selected with ⌘ and ⇧ and acted on together. A plain click still just opens a workspace, so nothing changes until you ask for a selection.
- Added Duplicate, for one workspace or a selection. A copy re-mints anything naming a live resource — a managed tmux session, a note — so it never shares a shell or a document with its original, while the directory, URL and folder carry over.
- Folders can be deleted with everything inside them, nested folders included, shutting down the terminals still running in them. That is offered separately from "Remove Folder Only", which dissolves the folder and keeps its workspaces where they were.
- The sidebar drop zone fills the rail instead of stopping where the list does, so a tab dragged into the empty space below the workspaces lands.

**Tabs**

- Tabs have a right-click menu: rename, duplicate, close, close others, close to the right, close all.

**Appearance**

- Sidebar rows lost their chrome. The active workspace was marked three times over — a bar down the leading edge, a row tint, and an amber-bordered chip around its icon — on a rounded row in a soft list. The tint is the only marker now, and the pane icon sits bare. The quick-launch pill, the search field and the update button lost their borders too, and everything below the header shares one left rhythm.
- Chrome text was set in fourteen hand-picked pixel values between 9 and 15px, often two of them a half-pixel apart in the same component. It now resolves to six size tokens. The near-duplicate hover and border tokens are gone, and the four drifted copies of the "this pane can't run" card became one.

**Fixes**

- Fixed tooltips rendering their label in the same colour as their own background. The custom type scale was unknown to the class merger, which files an unrecognised `text-*` as a colour, so a size and a colour on the same element looked like two colours and one was dropped. The same collision was silently eating either the size or the colour wherever both appeared.
- Fixed sidebar tooltips vanishing instead of being clipped when they were wider than the rail. Everything to the right of the sidebar is a native view painted above the web contents. Tooltips are now confined to the rail and wrap rather than run off it.
- Fixed shortcut hints disappearing part-way through a run of ⌘1, ⌘2, ⌘1. A browser pane reported the modifier as released whenever it lost focus, which happens on every workspace switch while ⌘ is still held, and nothing brought the hints back.

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
