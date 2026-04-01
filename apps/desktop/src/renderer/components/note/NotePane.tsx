import { useState, useEffect, useCallback, useRef } from "react";
import {
  type NoteEditorChangeContext,
  type NoteEditorValue,
  NoteEditor,
  extractNoteTitle,
} from "@devspace/note-editor";
import "@devspace/note-editor/styles.css";
import type { NoteConfig } from "../../types/workspace";
import { useWorkspaceStore } from "../../store/workspace-store";

interface NotePaneProps {
  paneId: string;
  config: NoteConfig;
}

type LoadState = "loading" | "ready" | "error";

const DEFAULT_VALUE: NoteEditorValue = [
  {
    type: "p",
    children: [{ text: "" }],
  },
];

export default function NotePane({ paneId, config }: NotePaneProps) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [initialValue, setInitialValue] = useState<NoteEditorValue | string>(DEFAULT_VALUE);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestMarkdown = useRef<string | null>(null);
  const lastTitle = useRef<string>("Note");
  const updatePaneTitle = useWorkspaceStore((s) => s.updatePaneTitle);

  /** Persist note to disk as markdown. */
  const saveNow = useCallback(async () => {
    const md = latestMarkdown.current;
    if (md === null) return;
    const result = await window.api.notes.save(config.noteId, md);
    if (result && typeof result === "object" && "error" in result) {
      console.error("[NotePane] Save failed:", result.error);
      setSaveError(result.error);
    } else {
      setSaveError(null);
    }
  }, [config.noteId]);

  /** Schedule a debounced save (500ms). */
  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveNow();
      saveTimer.current = null;
    }, 500);
  }, [saveNow]);

  // Load note on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const raw = await window.api.notes.read(config.noteId);
        if (cancelled) return;
        if (raw && raw.trim().length > 0) {
          // raw is markdown — we'll deserialize it in the NoteEditor via the
          // MarkdownPlugin's value initializer
          setInitialValue(raw);
        }
        setLoadState("ready");
      } catch {
        if (!cancelled) setLoadState("error");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [config.noteId]);

  // Flush pending save on unmount + save on visibility change (app closing/hiding)
  useEffect(() => {
    const flushSave = () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      if (latestMarkdown.current !== null) {
        window.api.notes.save(config.noteId, latestMarkdown.current);
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        flushSave();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", flushSave);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", flushSave);
      flushSave();
    };
  }, [config.noteId]);

  const handleChange = useCallback(
    ({ value, editor, markdown }: NoteEditorChangeContext) => {
      if (!editor) return;
      latestMarkdown.current = markdown;

      // Update tab title only when it actually changes
      const title = extractNoteTitle(value);
      if (title !== lastTitle.current) {
        lastTitle.current = title;
        updatePaneTitle(paneId, title);
      }

      scheduleSave();
    },
    [paneId, updatePaneTitle, scheduleSave],
  );

  if (loadState === "loading") {
    return (
      <div className="note-pane note-pane-center">
        <span>Loading note...</span>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="note-pane note-pane-center">
        <span>Failed to load note</span>
      </div>
    );
  }

  return (
    <div className="note-pane">
      {saveError && <div className="note-save-error">Save failed: {saveError}</div>}
      <NoteEditor initialValue={initialValue} onChange={handleChange} />
    </div>
  );
}
