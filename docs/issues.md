# Reported Issues

**Purpose:** Track tactical bugs, polish items, and smaller feature requests reported by real users.

Keep this separate from `docs/roadmap/roadmap.md`. If an issue grows into a larger architectural effort or an actively planned product milestone, move or mirror it into the roadmap.

## Open

### 1. Devspace Shortcuts Override VS Code Shortcuts Inside Editor

- Status: open
- Priority: high
- Type: usability bug
- Current behavior: when the VS Code editor pane is focused, Devspace-level shortcuts still win, which makes core VS Code keybindings difficult or impossible to use normally.
- Relevant files: `apps/desktop/src/renderer/hooks/useAppShortcuts.ts`, `apps/desktop/src/renderer/components/EditorPane.tsx`, `apps/desktop/src/renderer/lib/native-pane-focus.ts`
- Likely next step: scope Devspace shortcuts so they yield when focus is inside the VS Code/editor surface, while still preserving explicit app-global shortcuts where intended.

## Completed

### 1. VS Code Launch No Longer Depends Only On `code` In PATH

- Status: fixed
- Priority: high
- Type: compatibility bug
- Resolution: Devspace now supports an explicit VS Code CLI path/command, prefers the standard VS Code app bundle when auto-detecting, and only falls back to `code` in `PATH` after that.
- Relevant files: `apps/desktop/src/main/vscode-server.ts`, `apps/desktop/src/renderer/components/SettingsPage.tsx`, `apps/desktop/src/renderer/components/EditorPane.tsx`
- Commit: `41ad6aa` `fix: support configurable VS Code CLI detection`

### 2. Theme Switching

- Status: fixed
- Priority: medium
- Type: feature
- Resolution: Devspace now supports persisted `system`, `dark`, and `light` theme modes in Settings, and `useTheme()` honors the selected override.
- Relevant files: `apps/desktop/src/renderer/hooks/useTheme.ts`, `apps/desktop/src/renderer/store/settings-store.ts`, `apps/desktop/src/renderer/components/SettingsPage.tsx`
- Commit: `678819a` `feat: add manual theme mode selection`

### 3. Fullscreen Traffic-Light Spacing

- Status: fixed
- Priority: medium
- Type: UX polish bug
- Resolution: the sidebar, collapsed-sidebar top-left controls, and settings header now all react to native fullscreen state so traffic-light spacing is only reserved when needed.
- Relevant files: `apps/desktop/src/renderer/components/Sidebar/Sidebar.tsx`, `apps/desktop/src/renderer/components/GroupTabBar.tsx`, `apps/desktop/src/renderer/components/SettingsPage.tsx`, `apps/desktop/src/main/ipc/system.ts`
- Commits:
  - `258b5ff` `fix: adjust fullscreen header spacing`
  - `8351a25` `fix: make settings a modal overlay`

### 4. Settings Page Should Behave Like A Real App Modal

- Status: fixed
- Priority: medium
- Type: UX/navigation bug
- Resolution: Settings now renders as a whole-app modal overlay, closes on app navigation actions, and no longer traps the user behind a collapsed sidebar or allows navigation to continue behind the overlay.
- Relevant files: `apps/desktop/src/renderer/App.tsx`, `apps/desktop/src/renderer/components/SettingsPage.tsx`, `apps/desktop/src/renderer/hooks/useAppShortcuts.ts`
- Commit: `8351a25` `fix: make settings a modal overlay`
