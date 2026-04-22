# Reported Issues

**Purpose:** Track tactical bugs, polish items, and smaller feature requests reported by real users.

Keep this separate from `docs/roadmap/roadmap.md`. If an issue grows into a larger architectural effort or an actively planned product milestone, move or mirror it into the roadmap.

## Open

### 1. Embedded VS Code Shortcuts Still Get Stolen

- Status: open
- Priority: high
- Type: editor usability regression
- Summary: embedded VS Code panes still lose common editor shortcuts like copy, paste, and save even though Devspace is supposed to yield normal command/control shortcuts back to VS Code.
- Notes: current shortcut ownership code says this should already be fixed, so treat this as a regression against the existing editor shortcut handoff rather than a net-new integration gap.
- Relevant files: `apps/desktop/src/main/browser/browser-web-shortcuts.ts`, `apps/desktop/src/main/browser/browser-pane-webcontents-events.ts`, `apps/desktop/src/main/ipc/terminal-editor.ts`

### 2. Embedded VS Code Auto-Saves Immediately And Never Shows Dirty State

- Status: open
- Priority: high
- Type: editor integration investigation
- Summary: embedded VS Code panes appear to save immediately while editing and do not show the normal dirty indicator in the title.
- Notes: Devspace does not appear to set `files.autoSave` itself, so the leading hypothesis is persisted VS Code-side settings or profile state inside the embedded editor environment rather than explicit Devspace save wiring. This still needs real reproduction and confirmation.
- Relevant files: `.vscode/settings.json`, `apps/desktop/src/renderer/components/EditorPane.tsx`, `apps/desktop/src/main/vscode-server.ts`

### 3. Browser Pane Does Not Reliably Regain Native Focus On Click

- Status: open
- Priority: high
- Type: browser/native focus bug
- Summary: selecting or clicking an already-visible browser pane can update renderer focus state without restoring native keyboard focus into the underlying browser view.
- Notes: browser/editor/t3code panes currently auto-focus when they first become visible, but not when focus later moves between split groups or tabs while the native view is already mounted.
- Relevant files: `apps/desktop/src/renderer/components/browser/useBrowserPaneController.ts`, `apps/desktop/src/renderer/components/EditorPane.tsx`, `apps/desktop/src/renderer/components/T3CodePane.tsx`, `apps/desktop/src/renderer/components/PaneGroupContainer.tsx`, `apps/desktop/src/renderer/components/GroupTabBar.tsx`

### 4. Browser Auto-Refresh Still Steals Focus

- Status: open
- Priority: high
- Type: browser usability regression
- Summary: browser pane reloads and localhost auto-refreshes can still steal focus away from the pane the user is actively working in.
- Notes: current main-process focus propagation includes pointer-gating intended to prevent this, so if the bug is still reproducible it should be treated as a regression against that earlier fix and covered with stronger integration testing.
- Relevant files: `apps/desktop/src/main/browser/browser-pane-webcontents-events.ts`, `apps/desktop/src/renderer/hooks/useBrowserBridge.ts`, `apps/desktop/src/main/browser/__tests__/browser-pane-manager.test.ts`

### 5. Terminal Sometimes Needs A Re-Focus Resize To Recover Correct Size

- Status: open
- Priority: high
- Type: terminal/native-view bug
- Summary: terminal apps can end up with a stale size after focus churn, and focusing back into the pane does not reliably re-apply the correct size until the window or split is manually resized.
- Notes: the practical requirement here is to force a reliable terminal resize/reflow when focus returns so TUIs and full-screen terminal apps recover immediately instead of waiting for a later layout event.
- Relevant files: `apps/desktop/src/renderer/components/TerminalPane.tsx`, `apps/desktop/src/renderer/hooks/useNativeView.ts`, `apps/desktop/src/renderer/store/native-view-store.ts`, `apps/desktop/src/renderer/hooks/app-shortcut-actions.ts`

### 6. Tab Reorder Drag Still Feels Unreliable

- Status: open
- Priority: medium
- Type: interaction regression
- Summary: tab reordering still does not feel reliable in practice even though the earlier reorder-index and insertion-marker stabilization work landed.
- Notes: the remaining issue is likely around focus or native-view interference during drag start and drag-over, not the basic destination-index calculation itself.
- Relevant files: `apps/desktop/src/renderer/components/GroupTabBar.tsx`, `apps/desktop/src/renderer/lib/dnd/handlers/tab-reorder.ts`, `apps/desktop/src/renderer/store/native-view-store.ts`, `apps/desktop/src/renderer/hooks/useDndOrchestrator.ts`

### 7. New Notes Should Auto-Focus And Avoid The Blank-Page Effect

- Status: open
- Priority: medium
- Type: notes UX polish
- Summary: creating a new note should put the caret into the editor immediately and make the empty state feel intentional instead of blank.
- Notes: the note editor already has a `Start writing...` placeholder plugin, but note panes do not currently participate in the native pane focus flow and the editor only focuses on click.
- Relevant files: `apps/desktop/src/renderer/components/PaneGroupContent.tsx`, `apps/desktop/src/renderer/components/note/NotePane.tsx`, `packages/note-editor/src/NoteEditor.tsx`, `packages/note-editor/src/plugins/block-placeholder-kit.tsx`

### 8. Ghostty Terminals Do Not Fully Track Devspace Dark/Light Mode

- Status: open
- Priority: medium
- Type: terminal theme integration bug
- Summary: native Ghostty terminal panes do not reliably pick up Devspace dark/light mode state.
- Notes: Devspace theme handling is currently renderer-only, and Ghostty's native appearance sync likely misses the initial surface-attachment path. Explicit Devspace `dark` and `light` mode also are not currently plumbed into native terminal theme state.
- Relevant files: `apps/desktop/src/renderer/hooks/useTheme.ts`, `apps/desktop/src/renderer/store/settings-store.ts`, `packages/ghostty-electron/native/ghostty_bridge.mm`

## Completed

### 1. Embedded VS Code Auth / Session Mismatch

- Status: fixed
- Priority: high
- Type: editor integration bug
- Resolution: Devspace now manages the actual `code serve-web` listener instead of the wrapper process, isolates dev/build `userData` and editor Chromium sessions, removes the broken mint-key override, re-navigates existing editor panes when fresh URLs are issued, and defaults the background editor server to off.
- Relevant files: `apps/desktop/src/main/vscode-server.ts`, `apps/desktop/src/main/browser/browser-session-manager.ts`, `apps/desktop/src/main/browser/browser-pane-manager.ts`, `apps/desktop/src/main/index.ts`, `apps/desktop/src/main/dev-mode.ts`
- Commits:
  - `cab731b` `fix: harden VS Code server reuse`
  - `c82bddd` `fix: isolate embedded VS Code sessions`

### 2. Note Editor Tooltip Provider Crash

- Status: fixed
- Priority: high
- Type: editor bug
- Resolution: the note editor now guarantees a `TooltipProvider` at the editor root, so floating toolbar and selection-driven tooltip consumers no longer crash when text selection mounts them.
- Relevant files: `packages/note-editor/src/NoteEditor.tsx`, `packages/note-editor/src/NoteEditor.test.tsx`, `packages/note-editor/src/plate-ui/tooltip.tsx`, `packages/note-editor/src/plate-ui/toolbar.tsx`
- Commit: `48e169e` `fix: provide note editor tooltip context`

### 3. VS Code Launch No Longer Depends Only On `code` In PATH

- Status: fixed
- Priority: high
- Type: compatibility bug
- Resolution: Devspace now supports an explicit VS Code CLI path/command, prefers the standard VS Code app bundle when auto-detecting, and only falls back to `code` in `PATH` after that.
- Relevant files: `apps/desktop/src/main/vscode-server.ts`, `apps/desktop/src/renderer/components/SettingsPage.tsx`, `apps/desktop/src/renderer/components/EditorPane.tsx`
- Commit: `41ad6aa` `fix: support configurable VS Code CLI detection`

### 4. Theme Switching

- Status: fixed
- Priority: medium
- Type: feature
- Resolution: Devspace supports persisted `system`, `dark`, and `light` theme modes in Settings, `useTheme()` toggles the root `.dark` class, and the renderer design tokens now apply dark-mode values through explicit `:root.dark` overrides so the UI actually changes when the setting changes.
- Relevant files: `apps/desktop/src/renderer/hooks/useTheme.ts`, `apps/desktop/src/renderer/store/settings-store.ts`, `apps/desktop/src/renderer/components/SettingsPage.tsx`, `apps/desktop/src/renderer/styles/design-tokens.css`
- Commits:
  - `678819a` `feat: add manual theme mode selection`
  - `72c2c67` `fix: restore theme token switching`

### 5. Fullscreen Traffic-Light Spacing

- Status: fixed
- Priority: medium
- Type: UX polish bug
- Resolution: the sidebar, collapsed-sidebar top-left controls, and settings header now all react to native fullscreen state so traffic-light spacing is only reserved when needed.
- Relevant files: `apps/desktop/src/renderer/components/Sidebar/Sidebar.tsx`, `apps/desktop/src/renderer/components/GroupTabBar.tsx`, `apps/desktop/src/renderer/components/SettingsPage.tsx`, `apps/desktop/src/main/ipc/system.ts`
- Commits:
  - `258b5ff` `fix: adjust fullscreen header spacing`
  - `8351a25` `fix: make settings a modal overlay`

### 6. Settings Page Should Behave Like A Real App Modal

- Status: fixed
- Priority: medium
- Type: UX/navigation bug
- Resolution: Settings now renders as a whole-app modal overlay, closes on app navigation actions, and no longer traps the user behind a collapsed sidebar or allows navigation to continue behind the overlay.
- Relevant files: `apps/desktop/src/renderer/App.tsx`, `apps/desktop/src/renderer/components/SettingsPage.tsx`, `apps/desktop/src/renderer/hooks/useAppShortcuts.ts`
- Commit: `8351a25` `fix: make settings a modal overlay`

### 7. Devspace Shortcuts Yield To VS Code Inside Editor Panes

- Status: fixed
- Priority: high
- Type: usability bug
- Resolution: editor panes now yield command/control shortcuts back to VS Code by default, while keeping the explicit app-global close-window shortcut owned by Devspace.
- Relevant files: `apps/desktop/src/main/browser/browser-web-shortcuts.ts`, `apps/desktop/src/main/browser/browser-pane-webcontents-events.ts`
- Commit: `402f2bf` `fix: yield editor shortcuts to VS Code`

### 8. Browser Permission Prompts Silently Denied Unknown Electron Permissions

- Status: fixed
- Priority: medium
- Type: browser capability bug
- Resolution: browser session permission handling now forwards broader Electron permission types like `storage-access` to the renderer prompt instead of hard-denying everything outside the original camera/microphone/geolocation/notifications set, and the prompt UI now renders readable labels for those requests.
- Relevant files: `apps/desktop/src/main/browser/browser-session-manager.ts`, `apps/desktop/src/shared/browser.ts`, `apps/desktop/src/renderer/components/browser/BrowserPermissionPrompt.tsx`, `apps/desktop/src/main/browser/__tests__/browser-session-manager.test.ts`, `apps/desktop/src/renderer/components/browser/BrowserPermissionPrompt.test.tsx`
- Commit: `bb0a82a` `fix: broaden browser permission handling`

### 9. Localhost Hot Reload Steals Focus

- Status: fixed
- Priority: high
- Type: usability bug
- Resolution: browser pane focus events now only propagate back into renderer workspace focus state when they follow an actual pointer interaction inside the native web contents, which prevents localhost reload churn from surfacing a browser pane and stealing focus on its own.
- Relevant files: `apps/desktop/src/main/browser/browser-pane-webcontents-events.ts`, `apps/desktop/src/main/browser/__tests__/browser-pane-manager.test.ts`
- Commit: `3e44dac` `fix: improve browser pane auth fallback`

### 10. Browser History Backup Warns On First Persist

- Status: fixed
- Priority: low
- Type: logging bug
- Resolution: browser history persistence no longer warns on the initial backup copy when the primary history file has not been created yet.
- Relevant files: `apps/desktop/src/main/browser/browser-history-service.ts`, `apps/desktop/src/main/browser/__tests__/browser-history-service.test.ts`
- Commit: `3e44dac` `fix: improve browser pane auth fallback`

### 11. Tab Dragging Reordered Unreliably And Felt Like It Was Swimming

- Status: fixed
- Priority: medium
- Type: interaction bug
- Resolution: tab drags now resolve to explicit insertion indexes and render stable insertion markers instead of visually shifting the whole strip around during reorder. The tab bar keeps the dragged overlay separate from the destination indicator so the interaction feels anchored.
- Relevant files: `apps/desktop/src/renderer/components/GroupTabBar.tsx`, `apps/desktop/src/renderer/styles/workspace-shell.css`, `apps/desktop/src/renderer/lib/dnd/handlers/tab-reorder.ts`, `apps/desktop/src/renderer/lib/dnd/types.ts`, `apps/desktop/src/renderer/store/slices/group-tabs.ts`
- Commit: `341b245` `fix: stabilize drag interactions`

### 12. Sidebar Empty-Space Drops, Folder Boundaries, And Empty Pinned Drag Shifts

- Status: fixed
- Priority: medium
- Type: interaction polish bug
- Resolution: sidebar drag filtering now preserves real root targets for empty-space drops, prefers concrete folder/workspace targets over root collisions when both are present, and keeps the main scrollable content itself droppable so blank space can accept drops. The empty pinned section no longer appears during active drag, so dragging does not shift because a temporary section was inserted.
- Relevant files: `apps/desktop/src/renderer/hooks/useDndOrchestrator.ts`, `apps/desktop/src/renderer/lib/dnd/handlers/sidebar-reorder.ts`, `apps/desktop/src/renderer/lib/dnd/handlers/tab-to-sidebar.ts`, `apps/desktop/src/renderer/components/Sidebar/Sidebar.tsx`, `apps/desktop/src/renderer/components/Sidebar/sidebar.css`, `apps/desktop/src/renderer/components/SidebarShell.test.tsx`
- Commit: `341b245` `fix: stabilize drag interactions`

### 13. Browser Pane Passkeys / WebAuthn

- Status: fixed
- Priority: high
- Type: capability bug
- Resolution: full in-pane passkey support on macOS appears limited by upstream Electron WebAuthn behavior, so Devspace now treats the explicit `Open in External Browser` action as the product fallback for those auth flows instead of continuing to chase a pane-local fix.
- Relevant files: `apps/desktop/src/renderer/components/BrowserPane.tsx`, `apps/desktop/src/renderer/lib/browser-context-menu.ts`, `apps/desktop/src/renderer/hooks/useBrowserBridge.ts`, `docs/issues.md`
- Commits:
  - `3e44dac` `fix: improve browser pane auth fallback`
  - `ce0fbb8` `docs: clarify browser and editor trust posture`
- Upstream reference: `electron/electron#24573`
