# Reported Issues

**Purpose:** Track tactical bugs, polish items, and smaller feature requests reported by real users.

Keep this separate from `docs/roadmap/roadmap.md`. If an issue grows into a larger architectural effort or an actively planned product milestone, move or mirror it into the roadmap.

## Open

### 1. VS Code Launch Should Not Depend Only On `code` In PATH

- Status: open
- Priority: high
- Type: compatibility bug
- Current behavior: `VscodeServerManager` resolves the editor CLI with `which code`, then launches `code serve-web`. If another install or shim owns `code` in `PATH` such as Cursor, editor launch can fail or launch the wrong tool.
- Relevant files: `apps/desktop/src/main/vscode-server.ts`, `apps/desktop/src/renderer/components/SettingsPage.tsx`
- Likely next step: add smarter detection plus an explicit configured CLI path, and show which binary Devspace is using.

### 2. Add Theme Switching

- Status: open
- Priority: medium
- Type: feature
- Current behavior: Devspace follows the OS theme only. `useTheme()` listens to `prefers-color-scheme`, but there is no user override for `system`, `dark`, or `light`.
- Relevant files: `apps/desktop/src/renderer/hooks/useTheme.ts`, `apps/desktop/src/renderer/store/settings-store.ts`, `apps/desktop/src/renderer/components/SettingsPage.tsx`
- Likely next step: add a persisted `themeMode` setting, update `useTheme()` to honor it, and expose the control in Settings.

### 3. Remove Sidebar Traffic-Light Spacing In Native Fullscreen

- Status: open
- Priority: medium
- Type: UX polish bug
- Current behavior: the sidebar header always reserves traffic-light space, which looks wrong when the native window is fullscreen and those controls are not sitting in the same place.
- Relevant files: `apps/desktop/src/renderer/components/Sidebar/Sidebar.tsx`, `apps/desktop/src/main/window-chrome.ts`, `apps/desktop/src/main/ipc/system.ts`
- Likely next step: expose fullscreen state through main/preload and conditionally reduce or remove the reserved sidebar header spacing.
