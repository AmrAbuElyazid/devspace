import { useState, useEffect } from "react";
import { useSettingsStore } from "../store/settings-store";
import { useWorkspaceStore } from "../store/workspace-store";

export type HeldModifier = "command" | "control" | null;

/**
 * Track whether Cmd or Ctrl is held down (for showing shortcut hint badges).
 * Returns null when no relevant modifier is held.
 */
export function useModifierHeld(): HeldModifier {
  const showShortcutHintsOnModifierPress = useSettingsStore(
    (state) => state.showShortcutHintsOnModifierPress,
  );
  const [held, setHeld] = useState<HeldModifier>(null);

  useEffect(() => {
    if (!showShortcutHintsOnModifierPress) {
      setHeld(null);
    }

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (!showShortcutHintsOnModifierPress) {
        return;
      }

      if (e.key === "Meta") setHeld("command");
      else if (e.key === "Control") setHeld("control");
    };

    const handleKeyUp = (e: KeyboardEvent): void => {
      if (e.key === "Meta" || e.key === "Control") {
        useWorkspaceStore.getState().clearRecentTabTraversals();
      }

      if (!showShortcutHintsOnModifierPress) {
        return;
      }

      if (e.key === "Meta" || e.key === "Control") {
        setHeld((current) => {
          if (e.key === "Meta" && current === "command") return null;
          if (e.key === "Control" && current === "control") return null;
          return current;
        });
      }
    };

    // Clear on blur (window loses focus while modifier held)
    const handleBlur = (): void => {
      if (showShortcutHintsOnModifierPress) {
        setHeld(null);
      }
      useWorkspaceStore.getState().clearRecentTabTraversals();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    const disposeNativeModifier = window.api?.window?.onNativeModifierChanged
      ? window.api.window.onNativeModifierChanged((modifier) => {
          if (modifier === null) {
            useWorkspaceStore.getState().clearRecentTabTraversals();
          }
          if (showShortcutHintsOnModifierPress) {
            setHeld(modifier);
          }
        })
      : () => {};
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      disposeNativeModifier();
    };
  }, [showShortcutHintsOnModifierPress]);

  useEffect(() => {
    if (held === null) {
      useWorkspaceStore.getState().clearRecentTabTraversals();
    }
  }, [held]);

  return showShortcutHintsOnModifierPress ? held : null;
}
