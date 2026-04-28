import { useState, useEffect, useCallback, useRef, type KeyboardEvent } from "react";
import { RotateCcw } from "lucide-react";

import {
  fromKeyboardEvent,
  shortcutsEqual,
  toDisplayString,
  type StoredShortcut,
} from "../../../shared/shortcuts";
import { cn } from "@/lib/utils";

interface ShortcutRecorderProps {
  /** Currently bound combination, or null for "unset". */
  current: StoredShortcut | null;
  /** Default value used to compute the reset state. */
  defaultShortcut: StoredShortcut | null;
  /** Called with a new combo, or null to unbind. */
  onRecord: (next: StoredShortcut | null) => void;
  /** Called when the reset button is pressed. */
  onReset: () => void;
  /** Optional conflict description shown as destructive tone. */
  conflict?: string;
}

/**
 * Click-to-record keyboard shortcut field. Stays a normal-looking pill until
 * activated; once recording, it pulses, captures the next valid combo, and
 * commits.
 *
 * The recorder uses the shared `fromKeyboardEvent` parser so all platforms
 * see the same StoredShortcut shape.
 */
export function ShortcutRecorder({
  current,
  defaultShortcut,
  onRecord,
  onReset,
  conflict,
}: ShortcutRecorderProps) {
  const [recording, setRecording] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Auto-blur once we stop recording so the next key press doesn't re-trigger.
  useEffect(() => {
    if (!recording) buttonRef.current?.blur();
  }, [recording]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (!recording) return;
      // Allow Escape to cancel without committing.
      if (
        event.key === "Escape" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        setRecording(false);
        return;
      }
      // Backspace clears the binding.
      if (
        event.key === "Backspace" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        setRecording(false);
        onRecord(null);
        return;
      }
      const next = fromKeyboardEvent(event);
      if (!next) return;
      event.preventDefault();
      event.stopPropagation();
      setRecording(false);
      onRecord(next);
    },
    [recording, onRecord],
  );

  const isDefault =
    !current && !defaultShortcut
      ? true
      : current && defaultShortcut
        ? shortcutsEqual(current, defaultShortcut)
        : false;

  const display = recording ? "Recording…" : current ? toDisplayString(current) : "Unset";

  return (
    <div className="flex items-center gap-1.5">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setRecording((r) => !r)}
        onKeyDown={handleKeyDown}
        title={conflict ?? (recording ? "Press a combination" : "Click to change")}
        className={cn(
          "inline-flex items-center justify-center min-w-[68px] h-6 px-2 rounded-md",
          "bg-surface border border-border text-foreground",
          "text-[11px] font-mono whitespace-nowrap",
          "transition-colors outline-none",
          "hover:border-border focus-visible:border-brand-edge focus-visible:ring-2 focus-visible:ring-brand-soft",
          recording &&
            "bg-brand-soft border-brand-edge text-foreground animate-[pulse-ring_1.5s_ease-in-out_infinite]",
          conflict && !recording && "border-destructive/50 text-destructive",
        )}
      >
        {display}
      </button>
      {!isDefault && !recording ? (
        <button
          type="button"
          onClick={onReset}
          aria-label="Reset to default"
          title="Reset to default"
          className={cn(
            "inline-flex items-center justify-center size-5 rounded-sm",
            "text-muted-foreground hover:text-foreground hover:bg-hover",
            "transition-colors",
          )}
        >
          <RotateCcw size={10} />
        </button>
      ) : null}
    </div>
  );
}
