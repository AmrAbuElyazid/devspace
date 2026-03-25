import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SettingsState {
  sidebarOpen: boolean
  settingsOpen: boolean
  fontSize: number
  defaultShell: string
  terminalScrollback: number
  terminalCursorStyle: 'block' | 'underline' | 'bar'
  keepVscodeServerRunning: boolean

  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  toggleSettings: () => void
  setSettingsOpen: (open: boolean) => void
  updateSetting: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      settingsOpen: false,
      fontSize: 13,
      defaultShell: '',
      terminalScrollback: 5000,
      terminalCursorStyle: 'block' as const,
      keepVscodeServerRunning: true,

      toggleSidebar() {
        set((s) => ({ sidebarOpen: !s.sidebarOpen }))
      },

      setSidebarOpen(open) {
        set({ sidebarOpen: open })
      },

      toggleSettings() {
        set((s) => ({ settingsOpen: !s.settingsOpen }))
      },

      setSettingsOpen(open) {
        set({ settingsOpen: open })
      },

      updateSetting(key, value) {
        set({ [key]: value } as Partial<SettingsState>)
      },
    }),
    {
      name: 'devspace:settings',
    },
  ),
)
