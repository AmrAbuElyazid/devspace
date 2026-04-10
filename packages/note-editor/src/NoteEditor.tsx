import { useCallback } from "react";
import type { Value } from "platejs";
import { MarkdownPlugin } from "@platejs/markdown";
import { type PlateEditor, Plate, usePlateEditor } from "platejs/react";

import { createNoteEditorPlugins } from "./plugins/note-editor-kit";
import { Editor, EditorContainer } from "./plate-ui/editor";
import { TooltipProvider } from "./plate-ui/tooltip";

export interface NoteEditorChangeContext {
  editor: PlateEditor | null;
  markdown: string;
  value: Value;
}

export type NoteEditorValue = Value;

export interface NoteEditorProps {
  initialValue: Value | string;
  onChange: (ctx: NoteEditorChangeContext) => void;
}

export function NoteEditor({ initialValue, onChange }: NoteEditorProps) {
  const plugins = createNoteEditorPlugins();

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
        onChange({ editor, markdown: JSON.stringify(value), value });
        return;
      }

      try {
        onChange({
          editor,
          markdown: editor.getApi(MarkdownPlugin).markdown.serialize(),
          value,
        });
      } catch {
        onChange({ editor, markdown: JSON.stringify(value), value });
      }
    },
    [onChange],
  );

  return (
    <TooltipProvider>
      <Plate editor={editor} onChange={handleChange}>
        <EditorContainer>
          <Editor placeholder="Start writing..." />
        </EditorContainer>
      </Plate>
    </TooltipProvider>
  );
}
