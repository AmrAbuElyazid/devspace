import { useCallback, useEffect, useRef, type MouseEvent } from "react";
import type { Value } from "platejs";
import { MarkdownPlugin } from "@platejs/markdown";
import { type PlateEditor, Plate, usePlateEditor } from "platejs/react";

import { createNoteEditorPlugins } from "./plugins/note-editor-kit";
import { Editor, EditorContainer } from "./plate-ui/editor";
import { TooltipProvider } from "./plate-ui/tooltip";

export interface NoteEditorChangeContext {
  editor: PlateEditor | null;
  markdown: string | null;
  serializationError: string | null;
  value: Value;
}

export type NoteEditorValue = Value;

export interface NoteEditorProps {
  autoFocus?: boolean;
  initialValue: Value | string;
  onChange: (ctx: NoteEditorChangeContext) => void;
}

function focusEditorAtCurrentSelectionOrEnd(editor: PlateEditor): void {
  editor.tf.focus();

  if (editor.selection) {
    return;
  }

  const end = editor.api.end([]);
  if (end) {
    editor.tf.select(end);
  }
}

export function NoteEditor({ autoFocus = false, initialValue, onChange }: NoteEditorProps) {
  const plugins = createNoteEditorPlugins();
  const wasAutoFocusRef = useRef(false);

  const editor = usePlateEditor({
    plugins,
    value:
      typeof initialValue === "string"
        ? (e) => e.getApi(MarkdownPlugin).markdown.deserialize(initialValue)
        : initialValue,
  });

  const handleChange = useCallback(
    ({ value, editor }: { value: Value; editor: PlateEditor | null }) => {
      if (!editor) {
        onChange({ editor, markdown: null, serializationError: "Editor unavailable", value });
        return;
      }

      try {
        onChange({
          editor,
          markdown: editor.getApi(MarkdownPlugin).markdown.serialize(),
          serializationError: null,
          value,
        });
      } catch (error) {
        onChange({
          editor,
          markdown: null,
          serializationError:
            error instanceof Error ? error.message : "Failed to serialize note content",
          value,
        });
      }
    },
    [onChange],
  );

  const handleEditorMouseDown = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) {
        return;
      }

      requestAnimationFrame(() => {
        focusEditorAtCurrentSelectionOrEnd(editor);
      });
    },
    [editor],
  );

  useEffect(() => {
    const shouldAutoFocus = autoFocus && !wasAutoFocusRef.current;
    wasAutoFocusRef.current = autoFocus;
    if (!shouldAutoFocus) {
      return;
    }

    requestAnimationFrame(() => {
      focusEditorAtCurrentSelectionOrEnd(editor);
    });
  }, [autoFocus, editor]);

  return (
    <TooltipProvider>
      <Plate editor={editor} onChange={handleChange}>
        <EditorContainer className="note-editor-shell">
          <Editor className="note-editor-content" onMouseDown={handleEditorMouseDown} />
        </EditorContainer>
      </Plate>
    </TooltipProvider>
  );
}
