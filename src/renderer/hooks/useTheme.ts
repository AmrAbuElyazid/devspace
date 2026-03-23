import { useEffect, useState } from 'react'
import { useSettingsStore } from '../store/settings-store'

// Custom event for notifying components (like terminals) about theme changes.
// This is more reliable than MutationObserver because it fires AFTER the
// dark class has been toggled, and works even when elements are visibility:hidden.
export const THEME_CHANGE_EVENT = 'devspace:theme-changed'

export function useTheme() {
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const [isDark, setIsDark] = useState(() => {
    return document.documentElement.classList.contains('dark')
  })

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
      // Notify all listeners (terminals, etc.) that the theme changed.
      // Use requestAnimationFrame to ensure the class change has been
      // committed to the DOM before listeners read it.
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT))
      })
    }

    window.api?.theme?.set(theme)

    if (theme === 'dark') {
      applyDarkClass(true)
    } else if (theme === 'light') {
      applyDarkClass(false)
    } else {
      window.api?.theme?.getNativeTheme().then((nativeTheme) => {
        applyDarkClass(nativeTheme === 'dark')
      })
    }

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
