import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SettingsState {
  theme: 'light' | 'dark' | 'system'
  sidebarOpen: boolean
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      sidebarOpen: true,

      setTheme(theme) {
        set({ theme })
      },

      toggleSidebar() {
        set((s) => ({ sidebarOpen: !s.sidebarOpen }))
      },

      setSidebarOpen(open) {
        set({ sidebarOpen: open })
      },
    }),
    {
      name: 'devspace:settings',
    },
  ),
)
