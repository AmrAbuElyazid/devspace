import { useEffect } from "react";
import { useSettingsStore } from "../store/settings-store";

/**
 * Sync devspace's own UI dark/light mode with the selected preference.
 *
 * Toggles the `.dark` class on `<html>` which activates the dark-mode
 * CSS custom properties defined via `@variant dark` in index.css.
 *
 * VS Code's theme is managed entirely within VS Code itself. Native terminal
 * views follow Electron's nativeTheme, so we mirror the selected theme mode
 * into the main process as well.
 */
export function useTheme(): void {
  const themeMode = useSettingsStore((s) => s.themeMode);

  useEffect(() => {
    window.api.window.setThemeMode(themeMode);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    let unsuppress: number | null = null;

    function apply(dark: boolean): void {
      const root = document.documentElement;
      if (root.classList.contains("dark") === dark) {
        // Effects re-run on every themeMode change, including light -> system
        // when the OS is already light. Suppressing transitions for a swap
        // that changes nothing would drop a frame of unrelated animation.
        return;
      }

      // Every element carrying a color transition would otherwise cross-fade
      // at once and smear the window through an intermediate palette. Hold
      // transitions off across the swap and release them on the next frame,
      // after the new custom properties have been painted.
      root.classList.add("no-transitions");
      root.classList.toggle("dark", dark);

      if (unsuppress !== null) cancelAnimationFrame(unsuppress);
      unsuppress = requestAnimationFrame(() => {
        unsuppress = requestAnimationFrame(() => {
          unsuppress = null;
          root.classList.remove("no-transitions");
        });
      });
    }

    // Listen for OS theme changes. Only attached in system mode.
    function onChange(e: MediaQueryListEvent): void {
      apply(e.matches);
    }

    if (themeMode === "system") {
      apply(mq.matches);
      mq.addEventListener("change", onChange);
    } else {
      apply(themeMode === "dark");
    }

    return () => {
      mq.removeEventListener("change", onChange);
      if (unsuppress === null) return;
      // Tearing down mid-swap must not strand the suppression class on
      // <html>, which would leave the whole app without transitions.
      cancelAnimationFrame(unsuppress);
      unsuppress = null;
      document.documentElement.classList.remove("no-transitions");
    };
  }, [themeMode]);
}
