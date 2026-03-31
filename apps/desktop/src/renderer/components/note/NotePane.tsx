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

export default function NotePane({ paneId, config }: NotePaneProps) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [initialValue, setInitialValue] = useState<Value>(DEFAULT_VALUE);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestValue = useRef<Value | null>(null);
  const updatePaneTitle = useWorkspaceStore((s) => s.updatePaneTitle);

  // Load note on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const raw = await window.api.notes.read(config.noteId);
        if (cancelled) return;
        if (raw) {
          const parsed = JSON.parse(raw) as Value;
          setInitialValue(parsed);
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

  // Flush pending save on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        if (latestValue.current) {
          window.api.notes.save(config.noteId, JSON.stringify(latestValue.current));
        }
      }
    };
  }, [config.noteId]);

  const handleChange = useCallback(
    ({ value }: { value: Value }) => {
      latestValue.current = value;

      // Update tab title from first heading or first text block
      const firstHeading = value.find(
        (n: any) => n.type === "h1" || n.type === "h2" || n.type === "h3",
      );
      const firstText = firstHeading ?? value[0];
      const titleText =
        firstText?.children
          ?.map((c: any) => c.text ?? "")
          .join("")
          .slice(0, 40) || "Untitled Note";
      updatePaneTitle(paneId, titleText || "Untitled Note");

      // Debounced auto-save (500ms)
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        window.api.notes.save(config.noteId, JSON.stringify(value));
        saveTimer.current = null;
      }, 500);
    },
    [config.noteId, paneId, updatePaneTitle],
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
