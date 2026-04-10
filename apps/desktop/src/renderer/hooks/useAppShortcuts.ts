import { useEffect } from "react";
import { dispatchAppShortcutAction, handleAppShortcutKeyDown } from "./app-shortcut-actions";

/**
 * Registers all IPC shortcut handlers (menu accelerators) and the DOM
 * Escape keydown handler.
 *
 * Extracted from App.tsx to keep the root component focused on layout.
 */
export function useAppShortcuts(): void {
  useEffect(() => {
    const disposeIpc = window.api.app.onAction(dispatchAppShortcutAction);

    window.addEventListener("keydown", handleAppShortcutKeyDown);
    return () => {
      window.removeEventListener("keydown", handleAppShortcutKeyDown);
      disposeIpc();
    };
  }, []);
}
