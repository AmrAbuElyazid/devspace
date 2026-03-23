import { useEffect, useState } from 'react'
import { useSettingsStore } from '../store/settings-store'

export function useTheme() {
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const [isDark, setIsDark] = useState(() => {
    // Initialize from current DOM state
    return document.documentElement.classList.contains('dark')
  })

  // Apply theme class + sync with Electron bridge
  useEffect(() => {
    let cancelled = false

    const applyDarkClass = (dark: boolean): void => {
      if (cancelled) return
      if (dark) {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
      setIsDark(dark)
    }

    // Tell Electron about the theme preference
    window.api?.theme?.set(theme)

    if (theme === 'dark') {
      applyDarkClass(true)
    } else if (theme === 'light') {
      applyDarkClass(false)
    } else {
      // 'system' — query native theme
      window.api?.theme?.getNativeTheme().then((nativeTheme) => {
        applyDarkClass(nativeTheme === 'dark')
      })
    }

    // Listen for native theme changes (only matters in 'system' mode)
    let unsubscribe: (() => void) | undefined
    if (theme === 'system' && window.api?.theme?.onNativeThemeChange) {
      unsubscribe = window.api.theme.onNativeThemeChange((nativeTheme) => {
        applyDarkClass(nativeTheme === 'dark')
      })
    }

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [theme])

  return { theme, setTheme, isDark } as const
}
