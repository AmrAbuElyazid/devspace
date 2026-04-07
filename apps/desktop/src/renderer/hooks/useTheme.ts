import { useEffect } from "react";
import { useSettingsStore } from "../store/settings-store";

/**
 * Sync devspace's own UI dark/light mode with the selected preference.
 *
 * Toggles the `.dark` class on `<html>` which activates the dark-mode
 * CSS custom properties defined via `@variant dark` in index.css.
 *
 * VS Code's theme is managed entirely within VS Code itself — devspace
 * does not attempt to control it via nativeTheme or any other mechanism.
 */
export function useTheme(): void {
  const themeMode = useSettingsStore((s) => s.themeMode);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");

    function apply(dark: boolean): void {
      document.documentElement.classList.toggle("dark", dark);
    }

    if (themeMode === "dark") {
      apply(true);
      return;
    }

    if (themeMode === "light") {
      apply(false);
      return;
    }

    // System mode follows the OS preference.
    apply(mq.matches);

    // Listen for OS theme changes.
    function onChange(e: MediaQueryListEvent): void {
      apply(e.matches);
    }

    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [themeMode]);
}
