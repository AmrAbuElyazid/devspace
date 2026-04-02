import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { PaneType, SplitDirection } from "../types/workspace";

/** The default pane type for new tabs, or 'picker' to always show the dialog. */
export type DefaultPaneType = PaneType | "picker";

/** Context for the pane picker dialog — describes what action triggered it. */
export interface PanePickerContext {
  action: "new-tab" | "new-workspace" | "split";
  workspaceId?: string;
  groupId?: string;
  splitDirection?: SplitDirection;
  /** For new-workspace created via folder context menu */
  parentFolderId?: string | null;
  container?: "main" | "pinned";
}

interface SettingsState {
  sidebarOpen: boolean;
  settingsOpen: boolean;
  showShortcutHintsOnModifierPress: boolean;
  fontSize: number;
  defaultShell: string;
  terminalScrollback: number;
  terminalCursorStyle: "block" | "underline" | "bar";
  keepVscodeServerRunning: boolean;
  sidebarWidth: number;
  /** Pane type to open by default for new tabs ('picker' shows the dialog) */
  defaultPaneType: DefaultPaneType;

  /** When non-null, the pane picker dialog is open with this context. */
  panePickerContext: PanePickerContext | null;

  /** Count of open overlays (dialogs, popovers) that should hide native views */
  overlayCount: number;
  /** True when any overlay is active (settings page or dialog/popover) */
  isOverlayActive: () => boolean;
  pushOverlay: () => void;
  popOverlay: () => void;

  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSettings: () => void;
  setSettingsOpen: (open: boolean) => void;
  openPanePicker: (context: PanePickerContext) => void;
  closePanePicker: () => void;
  updateSetting: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      sidebarOpen: true,
      settingsOpen: false,
      showShortcutHintsOnModifierPress: true,
      fontSize: 13,
      defaultShell: "",
      terminalScrollback: 5000,
      terminalCursorStyle: "block" as const,
      keepVscodeServerRunning: true,
      sidebarWidth: 220,
      defaultPaneType: "terminal" as const,
      panePickerContext: null,
      overlayCount: 0,

      isOverlayActive() {
        const s = get();
        return s.settingsOpen || s.overlayCount > 0;
      },

      pushOverlay() {
        set((s) => ({ overlayCount: s.overlayCount + 1 }));
      },

      popOverlay() {
        set((s) => ({ overlayCount: Math.max(0, s.overlayCount - 1) }));
      },

      toggleSidebar() {
        set((s) => ({ sidebarOpen: !s.sidebarOpen }));
      },

      setSidebarOpen(open) {
        set({ sidebarOpen: open });
      },

      setSidebarWidth(width) {
        set({ sidebarWidth: Math.max(160, Math.min(400, width)) });
      },

      toggleSettings() {
        set((s) => ({ settingsOpen: !s.settingsOpen }));
      },

      setSettingsOpen(open) {
        set({ settingsOpen: open });
      },

      openPanePicker(context) {
        // Incrementing overlayCount triggers the NativeViewManager store
        // subscription which calls reconcile(). reconcile() sees overlay
        // active, hides all native views, and blurs the terminal — all
        // synchronously in the same microtask.
        set((s) => ({ panePickerContext: context, overlayCount: s.overlayCount + 1 }));
      },

      closePanePicker() {
        set((s) => ({
          panePickerContext: null,
          overlayCount: Math.max(0, s.overlayCount - 1),
        }));
      },

      updateSetting(key, value) {
        set({ [key]: value } as Partial<SettingsState>);
      },
    }),
    {
      name: "devspace:settings",
      partialize: (state) => {
        // Exclude ephemeral state from persistence
        const { overlayCount: _ov, panePickerContext: _pp, ...persisted } = state;
        return persisted;
      },
      migrate: (persisted: unknown) => {
        const s = persisted as Record<string, unknown>;
        // Migrate 'empty' -> 'picker' for defaultPaneType
        if (s.defaultPaneType === "empty") {
          s.defaultPaneType = "picker";
        }
        if (typeof s.showShortcutHintsOnModifierPress !== "boolean") {
          s.showShortcutHintsOnModifierPress = true;
        }
        return s;
      },
      version: 2,
    },
  ),
);
