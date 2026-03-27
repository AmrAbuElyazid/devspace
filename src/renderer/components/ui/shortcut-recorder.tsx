import { useState, useCallback, useEffect, useRef } from "react";
import { RotateCcw } from "lucide-react";
import {
  fromKeyboardEvent,
  shortcutsEqual,
  toDisplayString,
  type StoredShortcut,
} from "../../../shared/shortcuts";

interface ShortcutRecorderProps {
  /** The currently active shortcut. */
  current: StoredShortcut;
  /** The factory default shortcut for this action. */
  defaultShortcut: StoredShortcut;
  /** Called when the user records a new shortcut. */
  onRecord: (shortcut: StoredShortcut) => void;
  /** Called when the user resets to default. */
  onReset: () => void;
  /** Optional conflict text (e.g. "Conflicts with Toggle Sidebar"). */
  conflict?: string | undefined;
}

export function ShortcutRecorder({
  current,
  defaultShortcut,
  onRecord,
  onReset,
  conflict,
}: ShortcutRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const isCustom = !shortcutsEqual(current, defaultShortcut);

  const startRecording = useCallback(() => {
    setIsRecording(true);
  }, []);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
  }, []);

  // Global keydown listener for recording
  useEffect(() => {
    if (!isRecording) return;

    const handler = (e: KeyboardEvent): void => {
      e.preventDefault();
      e.stopPropagation();

      // Escape cancels recording
      if (e.key === "Escape") {
        stopRecording();
        return;
      }

      const shortcut = fromKeyboardEvent(e);
      if (!shortcut) return; // bare modifier press

      // Must have at least one modifier (prevent bare letter shortcuts)
      if (!shortcut.command && !shortcut.control && !shortcut.option && !shortcut.shift) {
        return;
      }

      onRecord(shortcut);
      stopRecording();
    };

    // Click outside cancels recording
    const clickHandler = (e: MouseEvent): void => {
      if (buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        stopRecording();
      }
    };

    window.addEventListener("keydown", handler, true);
    window.addEventListener("mousedown", clickHandler, true);
    return () => {
      window.removeEventListener("keydown", handler, true);
      window.removeEventListener("mousedown", clickHandler, true);
    };
  }, [isRecording, onRecord, stopRecording]);

  return (
    <div className="flex items-center gap-1.5">
      <button
        ref={buttonRef}
        className={`shortcut-recorder-btn ${isRecording ? "recording" : ""} ${conflict ? "has-conflict" : ""}`}
        onClick={isRecording ? stopRecording : startRecording}
        title={conflict ?? (isRecording ? "Press a shortcut, Escape to cancel" : "Click to record")}
      >
        {isRecording ? (
          <span className="text-[10px] opacity-70">Press shortcut...</span>
        ) : (
          <span className="text-[10px] font-medium">{toDisplayString(current)}</span>
        )}
      </button>
      {isCustom && (
        <button
          className="shortcut-reset-btn"
          onClick={onReset}
          title={`Reset to ${toDisplayString(defaultShortcut)}`}
        >
          <RotateCcw size={10} />
        </button>
      )}
    </div>
  );
}
