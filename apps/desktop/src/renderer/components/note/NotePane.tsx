import { useState, useEffect, useCallback, useRef } from "react";
import type { Value } from "platejs";
import { type PlateEditor, Plate, usePlateEditor } from "platejs/react";
import { MarkdownPlugin } from "@platejs/markdown";
import type { NoteConfig } from "../../types/workspace";
import { createNoteEditorPlugins } from "../editor/plugins/note-editor-kit";
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
          setInitialValue(raw as unknown as Value);
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
    ({ value, editor }: { value: Value; editor: PlateEditor | null }) => {
      if (!editor) return;
      // Serialize to markdown for persistence
      try {
        const mdApi = editor.getApi(MarkdownPlugin).markdown;
        latestMarkdown.current = mdApi.serialize();
      } catch {
        // Fallback to JSON if markdown serialization fails
        latestMarkdown.current = JSON.stringify(value);
      }

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
  initialValue: Value | string;
  onChange: (ctx: { value: Value; editor: PlateEditor | null }) => void;
}) {
  const plugins = createNoteEditorPlugins();

  // If initialValue is a string, it's markdown — deserialize via MarkdownPlugin
  const editor = usePlateEditor({
    plugins,
    value:
      typeof initialValue === "string"
        ? (e) => e.getApi(MarkdownPlugin).markdown.deserialize(initialValue)
        : initialValue,
  });

  return (
    <Plate editor={editor} onChange={onChange}>
      <EditorContainer>
        <Editor placeholder="Start writing..." />
      </EditorContainer>
    </Plate>
  );
}
