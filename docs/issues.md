# Reported Issues

**Purpose:** Track tactical bugs, polish items, and smaller feature requests reported by real users.

Keep this separate from `docs/roadmap/roadmap.md`. If an issue grows into a larger architectural effort or an actively planned product milestone, move or mirror it into the roadmap.

## Open

### 1. Browser Pane Passkeys / WebAuthn

- Status: open
- Priority: high
- Type: capability bug
- Detail: passkeys do not currently work reliably inside browser panes on macOS. Devspace now forwards broader Electron permission types to the renderer instead of silently denying unknown ones, but a real GitHub login test still reports only partial passkey support. The current evidence points more strongly to an upstream Electron/macOS WebAuthn limitation than to a remaining Devspace permission bug, so the likely product follow-up is external-browser fallback and clearer user-facing messaging.
- Relevant files: `apps/desktop/src/main/browser/browser-session-manager.ts`, `apps/desktop/src/shared/browser.ts`, `apps/desktop/src/renderer/components/browser/BrowserPermissionPrompt.tsx`, `apps/desktop/src/main/browser/browser-pane-manager.ts`, `docs/issues.md`
- Upstream reference: `electron/electron#24573`

### 2. Localhost Hot Reload Steals Focus

- Status: open
- Priority: high
- Type: usability bug
- Detail: when a localhost app is open in a browser pane and its dev server hot reloads, Devspace can steal focus and surface the browser pane even while work is happening elsewhere. Focus currently propagates from native `webContents` events back into renderer workspace focus state and likely needs tighter gating around reload-driven focus churn.
- Relevant files: `apps/desktop/src/main/browser/browser-pane-webcontents-events.ts`, `apps/desktop/src/renderer/hooks/useBrowserBridge.ts`, `apps/desktop/src/renderer/components/BrowserPane.tsx`, `apps/desktop/src/renderer/hooks/useNativeView.ts`

### 3. Tab Dragging Does Not Reorder Reliably

- Status: open
- Priority: medium
- Type: interaction bug
- Detail: dragging tabs should reorder them predictably within and across groups, but the current drag intent and execute flow likely needs alignment between DnD hit targets, tab-bar behavior, and workspace store mutations.
- Relevant files: `apps/desktop/src/renderer/components/GroupTabBar.tsx`, `apps/desktop/src/renderer/lib/dnd/handlers/tab-reorder.ts`, `apps/desktop/src/renderer/store/slices/group-tabs.ts`

### 4. Sidebar Drag Bounds And Pinned Section Behavior

- Status: open
- Priority: medium
- Type: interaction polish bug
- Detail: dragging workspaces/folders in the sidebar has awkward folder bounds, and the pinned section should disappear during active drag. Current sidebar drop resolution uses simple vertical zones and keeps the pinned root visible as a drop region.
- Relevant files: `apps/desktop/src/renderer/components/Sidebar/Sidebar.tsx`, `apps/desktop/src/renderer/components/Sidebar/SidebarTreeLevel.tsx`, `apps/desktop/src/renderer/lib/sidebar-drop-resolution.ts`, `apps/desktop/src/renderer/store/slices/sidebar-tree.ts`

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
