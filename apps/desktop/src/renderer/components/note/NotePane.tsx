import { useState, useEffect, useCallback, useRef } from "react";
import type { Value } from "platejs";
import { Plate, usePlateEditor } from "platejs/react";
import type { NoteConfig } from "../../types/workspace";
import { NoteEditorKit } from "../editor/plugins/note-editor-kit";
import { Editor, EditorContainer } from "../plate-ui/editor";
import { useWorkspaceStore } from "../../store/workspace-store";
import "./note-styles.css";

interface NotePaneProps {
  paneId: string;
  config: NoteConfig;
}

type LoadState = "loading" | "ready" | "error";

const DEFAULT_VALUE: Value = [
  {
    type: "p",
    children: [{ text: "" }],
  },
];

/** Extract a display title from editor value (first heading or first block text). */
function extractTitle(value: Value): string {
  const firstHeading = value.find(
    (n: Record<string, unknown>) => n.type === "h1" || n.type === "h2" || n.type === "h3",
  );
  const node = firstHeading ?? value[0];
  const children = node?.children as Array<{ text?: string }> | undefined;
  return (
    children
      ?.map((c) => c.text ?? "")
      .join("")
      .slice(0, 40) || "Untitled Note"
  );
}

export default function NotePane({ paneId, config }: NotePaneProps) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [initialValue, setInitialValue] = useState<Value>(DEFAULT_VALUE);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestValue = useRef<Value | null>(null);
  const lastTitle = useRef<string>("Note");
  const updatePaneTitle = useWorkspaceStore((s) => s.updatePaneTitle);

  /** Persist note to disk. Returns true on success. */
  const saveNow = useCallback(async () => {
    const data = latestValue.current;
    if (!data) return;
    const result = await window.api.notes.save(config.noteId, JSON.stringify(data));
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
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as Value;
            // Validate basic structure: must be a non-empty array of nodes
            if (Array.isArray(parsed) && parsed.length > 0) {
              setInitialValue(parsed);
            } else {
              console.warn("[NotePane] Note has invalid structure, using default:", config.noteId);
            }
          } catch (parseErr) {
            // Corrupted JSON — log but don't block the editor.
            // User gets a fresh editor; the corrupted file stays on disk
            // (a future save will overwrite it with valid data).
            console.error(
              "[NotePane] Corrupted note JSON, starting fresh:",
              config.noteId,
              parseErr,
            );
          }
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
      if (latestValue.current) {
        // Fire-and-forget — best effort during teardown
        window.api.notes.save(config.noteId, JSON.stringify(latestValue.current));
      }
    };

    // Save when the window becomes hidden (user switching apps, closing)
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
    ({ value }: { value: Value }) => {
      latestValue.current = value;

      // Update tab title only when it actually changes
      const title = extractTitle(value);
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

/** Inner editor component — separated so usePlateEditor is stable after load */
function NoteEditor({
  initialValue,
  onChange,
}: {
  initialValue: Value;
  onChange: (ctx: { value: Value }) => void;
}) {
  const editor = usePlateEditor({
    plugins: NoteEditorKit,
    value: initialValue,
  });

  return (
    <Plate editor={editor} onChange={onChange}>
      <EditorContainer>
        <Editor placeholder="Start writing..." />
      </EditorContainer>
    </Plate>
  );
}
