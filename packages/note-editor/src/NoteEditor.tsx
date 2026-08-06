import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type MouseEvent,
  type Ref,
} from "react";
import type { TRange, Value } from "platejs";
import { MarkdownPlugin } from "@platejs/markdown";
import { type PlateEditor, Plate, usePlateEditor } from "platejs/react";

import { findMatches } from "./find-matches";
import { pruneFolds } from "./heading-fold";
import { createNoteEditorPlugins } from "./plugins/note-editor-kit";
import { FindReplacePlugin } from "@platejs/find-replace";
import { HeadingFoldPlugin } from "./plugins/heading-fold-kit";
import { ImageUploadPlugin, type UploadImage } from "./plugins/media-kit";
import { Editor, EditorContainer } from "./plate-ui/editor";
import { TooltipProvider } from "./plate-ui/tooltip";

export interface NoteEditorChangeContext {
  editor: PlateEditor | null;
  markdown: string | null;
  serializationError: string | null;
  value: Value;
}

export type NoteEditorValue = Value;

/**
 * What the hosting pane can ask the editor to do.
 *
 * The pane owns the find bar, the outline and the footer, but those need to act
 * on the document. Exposing a small command surface keeps Plate's API from
 * leaking into the app.
 */
export interface NoteEditorController {
  focus: () => void;
  /** Ranges of every match, in document order. */
  matches: (query: string) => TRange[];
  replaceAll: (query: string, replacement: string) => number;
  replaceMatch: (range: TRange, replacement: string) => void;
  scrollToBlock: (index: number) => void;
  /** Selects and reveals a match so the caret marks the current one. */
  selectMatch: (range: TRange) => void;
  toggleFold: (index: number) => void;
}

export interface NoteEditorProps {
  autoFocus?: boolean;
  controllerRef?: Ref<NoteEditorController | null>;
  /** Folded heading indices, so the pane can persist or reset them. */
  foldedIndices?: number[];
  initialValue: Value | string;
  onChange: (ctx: NoteEditorChangeContext) => void;
  onFoldedIndicesChange?: (indices: number[]) => void;
  /** Highlights every occurrence; the pane's find bar drives it. */
  search?: string;
  uploadImage?: UploadImage;
}

/**
 * Focusing an editor that has no layout box moves the caret out of whatever the
 * user is actually looking at. A pane group keeps inactive tabs mounted under
 * `display: none`, so autofocusing one would steal the caret from the visible
 * pane.
 */
function isRendered(editor: PlateEditor): boolean {
  try {
    const node = editor.api.toDOMNode(editor);
    // A `display: none` subtree has no boxes. Unlike `offsetParent`, this stays
    // correct for positioned ancestors.
    return !!node && node.getClientRects().length > 0;
  } catch {
    return false;
  }
}

function focusAtSelectionOrEnd(editor: PlateEditor): void {
  editor.tf.focus();

  // Returning to a tab should land where the user left off, not at the bottom.
  if (editor.selection) return;

  const end = editor.api.end([]);
  if (end) editor.tf.select(end);
}

export function NoteEditor({
  autoFocus = false,
  controllerRef,
  foldedIndices,
  initialValue,
  onChange,
  onFoldedIndicesChange,
  search = "",
  uploadImage,
}: NoteEditorProps) {
  const wasAutoFocusRef = useRef(false);

  const editor = usePlateEditor({
    plugins: createNoteEditorPlugins(),
    // Normalize on load, not just on the first edit. A note read from disk that
    // ends in a code block would otherwise open with no paragraph after it and
    // no way to add one.
    shouldNormalizeEditor: true,
    value:
      typeof initialValue === "string"
        ? (e) => e.getApi(MarkdownPlugin).markdown.deserialize(initialValue)
        : initialValue,
  });

  // Options rather than props: the plugins read them from the editor store, so
  // this is the seam between the pane's UI state and the document.
  useEffect(() => {
    editor.setOption(FindReplacePlugin, "search", search);
  }, [editor, search]);

  useEffect(() => {
    editor.setOption(ImageUploadPlugin, "uploadImage", uploadImage ?? null);
  }, [editor, uploadImage]);

  useEffect(() => {
    if (foldedIndices) editor.setOption(HeadingFoldPlugin, "folded", foldedIndices);
  }, [editor, foldedIndices]);

  const handleChange = useCallback(
    ({ value, editor: changed }: { value: Value; editor: PlateEditor | null }) => {
      if (!changed) {
        onChange({
          editor: changed,
          markdown: null,
          serializationError: "Editor unavailable",
          value,
        });
        return;
      }

      // Editing shifts block indices, so a fold can end up pointing at prose
      // with no chevron left to undo it.
      const folded = changed.getOption(HeadingFoldPlugin, "folded");
      if (folded.length > 0) {
        const pruned = pruneFolds(value, new Set(folded));
        if (pruned.size !== folded.length) {
          const next = [...pruned];
          changed.setOption(HeadingFoldPlugin, "folded", next);
          onFoldedIndicesChange?.(next);
        }
      }

      try {
        onChange({
          editor: changed,
          markdown: changed.getApi(MarkdownPlugin).markdown.serialize(),
          serializationError: null,
          value,
        });
      } catch (error) {
        onChange({
          editor: changed,
          markdown: null,
          serializationError:
            error instanceof Error ? error.message : "Failed to serialize note content",
          value,
        });
      }
    },
    [onChange, onFoldedIndicesChange],
  );

  useImperativeHandle(
    controllerRef,
    (): NoteEditorController => ({
      focus: () => focusAtSelectionOrEnd(editor),
      matches: (query) => findMatches(editor.children, query),
      replaceAll: (query, replacement) => {
        const ranges = findMatches(editor.children, query);
        if (ranges.length === 0) return 0;

        // Back to front: replacing shifts every offset after the match.
        editor.tf.withoutNormalizing(() => {
          for (const range of ranges.toReversed()) {
            editor.tf.insertText(replacement, { at: range });
          }
        });
        return ranges.length;
      },
      replaceMatch: (range, replacement) => {
        editor.tf.insertText(replacement, { at: range });
      },
      scrollToBlock: (index) => {
        const node = editor.api.toDOMNode(editor.children[index]!);
        node?.scrollIntoView({ block: "start", behavior: "smooth" });
      },
      selectMatch: (range) => {
        editor.tf.select(range);
        editor.tf.focus();
        editor.api
          .toDOMNode(editor.api.node(range.anchor.path.slice(0, -1))?.[0] as never)
          ?.scrollIntoView({ block: "nearest" });
      },
      toggleFold: (index) => {
        const folded = editor.getOption(HeadingFoldPlugin, "folded");
        const next = folded.includes(index)
          ? folded.filter((entry) => entry !== index)
          : [...folded, index];
        editor.setOption(HeadingFoldPlugin, "folded", next);
        onFoldedIndicesChange?.(next);
      },
    }),
    [editor, onFoldedIndicesChange],
  );

  const handleEditorMouseDown = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      // Only the padding below the last block; clicks on text place their own caret.
      if (event.target !== event.currentTarget) return;

      requestAnimationFrame(() => focusAtSelectionOrEnd(editor));
    },
    [editor],
  );

  useEffect(() => {
    const shouldAutoFocus = autoFocus && !wasAutoFocusRef.current;
    wasAutoFocusRef.current = autoFocus;
    if (!shouldAutoFocus) return;

    requestAnimationFrame(() => {
      if (!isRendered(editor)) return;
      focusAtSelectionOrEnd(editor);
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
