import { useState, useEffect } from "react";

export type HeldModifier = "command" | "control" | null;

/**
 * Track whether Cmd or Ctrl is held down (for showing shortcut hint badges).
 * Returns null when no relevant modifier is held.
 */
export function useModifierHeld(): HeldModifier {
  const [held, setHeld] = useState<HeldModifier>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Only track bare modifier presses (no other key held)
      if (e.key === "Meta") setHeld("command");
      else if (e.key === "Control") setHeld("control");
    };

    const handleKeyUp = (e: KeyboardEvent): void => {
      if (e.key === "Meta" && held === "command") setHeld(null);
      else if (e.key === "Control" && held === "control") setHeld(null);
    };

    // Clear on blur (window loses focus while modifier held)
    const handleBlur = (): void => {
      setHeld(null);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [held]);

  return held;
}
