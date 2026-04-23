# Reported Issues

**Purpose:** Track tactical bugs, polish items, and smaller feature requests reported by real users.

Keep this separate from `docs/roadmap/roadmap.md`. If an issue grows into a larger architectural effort or an actively planned product milestone, move or mirror it into the roadmap.

## Open

### 1. Embedded VS Code Auto-Saves Immediately And Never Shows Dirty State

- Status: open
- Priority: high
- Type: editor integration investigation
- Summary: embedded VS Code panes appear to save immediately while editing and do not show the normal dirty indicator in the title.
- Notes: Devspace does not appear to set `files.autoSave` itself, so the leading hypothesis is persisted VS Code-side settings or profile state inside the embedded editor environment rather than explicit Devspace save wiring. This still needs real reproduction and confirmation.
- Relevant files: `.vscode/settings.json`, `apps/desktop/src/renderer/components/EditorPane.tsx`, `apps/desktop/src/main/vscode-server.ts`

### 2. Browser Pane Does Not Reliably Regain Native Focus When Selected Indirectly

- Status: open
- Priority: high
- Type: browser/native focus bug
- Summary: switching to an already-mounted browser/editor/t3code pane through tab selection or split-group focus can still leave the native web contents without keyboard focus even when the workspace/tab state is correct.
- Notes: pane-content clicks now correctly sync pane activation and active tab state after `93530e7`, so any remaining repro here should be treated as a native first-responder restoration problem on tab/group selection rather than a pane/tab desync.
- Relevant files: `apps/desktop/src/renderer/components/browser/useBrowserPaneController.ts`, `apps/desktop/src/renderer/components/EditorPane.tsx`, `apps/desktop/src/renderer/components/T3CodePane.tsx`, `apps/desktop/src/renderer/components/GroupTabBar.tsx`, `apps/desktop/src/renderer/lib/native-pane-focus.ts`

### 3. Tab Reorder Drag Still Feels Unreliable

- Status: open
- Priority: medium
- Type: interaction regression
- Summary: tab reordering still does not feel reliable in practice even though the earlier reorder-index and insertion-marker stabilization work landed.
- Notes: the remaining issue is likely around focus or native-view interference during drag start and drag-over, not the basic destination-index calculation itself.
- Relevant files: `apps/desktop/src/renderer/components/GroupTabBar.tsx`, `apps/desktop/src/renderer/lib/dnd/handlers/tab-reorder.ts`, `apps/desktop/src/renderer/store/native-view-store.ts`, `apps/desktop/src/renderer/hooks/useDndOrchestrator.ts`

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

### 7. Devspace Shortcuts And Clipboard Work Inside VS Code Editor Panes

- Status: fixed
- Priority: high
- Type: usability bug
- Resolution: editor panes now yield normal command/control shortcuts back to VS Code by default, keep only the explicit Devspace `leader` shortcut app-owned while focused, auto-allow trusted local clipboard permissions for the embedded editor origin, and route copy/paste/cut to the native editor web contents so clipboard behavior works reliably.
- Relevant files: `apps/desktop/src/main/browser/browser-web-shortcuts.ts`, `apps/desktop/src/main/browser/browser-pane-webcontents-events.ts`, `apps/desktop/src/main/browser/browser-session-manager.ts`, `apps/desktop/src/shared/shortcuts.ts`, `apps/desktop/src/renderer/hooks/app-shortcut-actions.ts`
- Commits:
  - `402f2bf` `fix: yield editor shortcuts to VS Code`
  - `57d3fc2` `fix: support leader capture and clipboard shortcuts in editor panes`

### 8. Browser Permission Prompts Silently Denied Unknown Electron Permissions

- Status: fixed
- Priority: medium
- Type: browser capability bug
- Resolution: browser session permission handling now forwards broader Electron permission types like `storage-access` to the renderer prompt instead of hard-denying everything outside the original camera/microphone/geolocation/notifications set, and the prompt UI now renders readable labels for those requests.
- Relevant files: `apps/desktop/src/main/browser/browser-session-manager.ts`, `apps/desktop/src/shared/browser.ts`, `apps/desktop/src/renderer/components/browser/BrowserPermissionPrompt.tsx`, `apps/desktop/src/main/browser/__tests__/browser-session-manager.test.ts`, `apps/desktop/src/renderer/components/browser/BrowserPermissionPrompt.test.tsx`
- Commit: `bb0a82a` `fix: broaden browser permission handling`

### 9. Localhost Hot Reload / Browser Auto-Refresh Steals Focus

- Status: fixed
- Priority: high
- Type: usability bug
- Resolution: browser pane focus events now only propagate back into renderer workspace focus state when they follow an actual pointer interaction inside the native web contents, and the forwarding path has been hardened so localhost reload churn or browser auto-refresh cannot surface a pane and steal focus on their own.
- Relevant files: `apps/desktop/src/main/browser/browser-pane-webcontents-events.ts`, `apps/desktop/src/main/browser/__tests__/browser-pane-manager.test.ts`
- Commits:
  - `3e44dac` `fix: improve browser pane auth fallback`
  - `3483162` `fix: harden browser focus forwarding`

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

### 14. Terminal Refocus Reflows Restore Correct Size

- Status: fixed
- Priority: high
- Type: terminal/native-view bug
- Resolution: native terminal focus now forces a real layout/reflow pass when focus returns, so TUIs and full-screen terminal apps recover the correct size immediately instead of waiting for a later manual resize.
- Relevant files: `packages/ghostty-electron/native/ghostty_bridge.mm`, `apps/desktop/src/renderer/components/TerminalPane.tsx`
- Commit: `fd9a271` `fix: restore native pane focus reflows`

### 15. New Notes Auto-Focus And Avoid The Blank-Page Effect

- Status: fixed
- Priority: medium
- Type: notes UX polish
- Resolution: new note panes now participate in pane focus activation so the editor receives focus immediately when selected, which makes the existing placeholder-driven empty state feel intentional instead of like a dead blank page.
- Relevant files: `apps/desktop/src/renderer/components/note/NotePane.tsx`, `apps/desktop/src/renderer/components/PaneGroupContent.tsx`, `packages/note-editor/src/NoteEditor.tsx`, `packages/note-editor/src/plugins/block-placeholder-kit.tsx`
- Commit: `2c05203` `fix: focus notes and sync terminal themes`

### 16. Ghostty Terminals Do Not Fully Track Devspace Dark/Light Mode

- Status: fixed
- Priority: medium
- Type: terminal theme integration bug
- Resolution: native Ghostty panes now receive Devspace dark/light theme updates reliably, including explicit app theme switches instead of only whatever native appearance happened to be present during initial surface attachment.
- Relevant files: `apps/desktop/src/renderer/hooks/useTheme.ts`, `apps/desktop/src/renderer/store/settings-store.ts`, `packages/ghostty-electron/native/ghostty_bridge.mm`
- Commit: `2c05203` `fix: focus notes and sync terminal themes`

### 17. Pane Activation Could Drift From Native Focus

- Status: fixed
- Priority: high
- Type: focus/state-sync bug
- Resolution: pane activation now syncs the active workspace, focused group, and active tab from a single pane-id-based path. Native browser/editor and terminal panes also re-emit activation when clicked while already focused, so clicking pane content can no longer leave the tab strip highlighting a different pane.
- Relevant files: `apps/desktop/src/renderer/lib/native-pane-focus.ts`, `apps/desktop/src/renderer/components/PaneGroupContent.tsx`, `apps/desktop/src/renderer/hooks/useTerminalEvents.ts`, `apps/desktop/src/main/browser/browser-pane-webcontents-events.ts`, `packages/ghostty-electron/native/ghostty_bridge.mm`
- Commit: `93530e7` `fix: keep pane activation synced with native focus`
