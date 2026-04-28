import { useEffect, useRef, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils";
import { releaseNativeFocus } from "@/lib/native-pane-focus";

interface InlineRenameInputProps {
  initialValue: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
  className?: string;
  /** Optional id for testing / a11y. */
  id?: string;
  /** Optional aria-label for assistive tech. */
  "aria-label"?: string;
}

/**
 * A bare-bones inline rename field. Used inside sidebar rows and tab labels
 * so the visual frame stays the same while the user edits in place.
 *
 * Behavior:
 *   • Auto-selects on mount (after releasing native pane focus so the input
 *     can actually receive focus inside an Electron WebContentsView host).
 *   • Enter commits, Escape cancels, blur commits.
 *   • Empty / whitespace-only values cancel instead of committing.
 */
export function InlineRenameInput({
  initialValue,
  onCommit,
  onCancel,
  className,
  id,
  "aria-label": ariaLabel,
}: InlineRenameInputProps) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    releaseNativeFocus();
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.select();
    });
  }, []);

  function handleKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      const next = ref.current?.value.trim() ?? "";
      if (next.length === 0) onCancel();
      else onCommit(next);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  }

  function handleBlur() {
    const next = ref.current?.value.trim() ?? "";
    if (next.length === 0 || next === initialValue) onCancel();
    else onCommit(next);
  }

  return (
    <input
      ref={ref}
      id={id}
      defaultValue={initialValue}
      onKeyDown={handleKey}
      onBlur={handleBlur}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      aria-label={ariaLabel}
      className={cn(
        "flex-1 min-w-0 bg-transparent outline-none border-none p-0 m-0",
        "text-current font-inherit",
        className,
      )}
      // Inputs inside Electron frameless windows must opt out of -webkit-app-region: drag
      // so they actually receive pointer/keyboard input.
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
    />
  );
}
