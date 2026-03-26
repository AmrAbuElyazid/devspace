import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  sidebarOpen: boolean;
  settingsOpen: boolean;
  fontSize: number;
  defaultShell: string;
  terminalScrollback: number;
  terminalCursorStyle: "block" | "underline" | "bar";
  keepVscodeServerRunning: boolean;
  sidebarWidth: number;
  /** Pane type to open by default for new tabs ('empty' shows the picker) */
  defaultPaneType: "empty" | "terminal" | "browser" | "editor" | "t3code";

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
  updateSetting: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      sidebarOpen: true,
      settingsOpen: false,
      fontSize: 13,
      defaultShell: "",
      terminalScrollback: 5000,
      terminalCursorStyle: "block" as const,
      keepVscodeServerRunning: true,
      sidebarWidth: 220,
      defaultPaneType: "terminal" as const,
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

      updateSetting(key, value) {
        set({ [key]: value } as Partial<SettingsState>);
      },
    }),
    {
      name: "devspace:settings",
      partialize: (state) => {
        // Exclude ephemeral state from persistence
        const { overlayCount: _overlayCount, ...persisted } = state;
        return persisted;
      },
    },
  ),
);
