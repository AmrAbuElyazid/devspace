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
import {
  type PlateEditor,
  Plate,
  useEditorRef,
  usePlateEditor,
  usePluginOption,
  useRedecorate,
} from "platejs/react";

import { findMatches } from "./find-matches";
import { serializeNoteMarkdown } from "./markdown/serialize";
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
  /** The markdown the editor would persist right now. */
  markdown: () => string;
  /** Ranges of every match, in document order. */
  matches: (query: string) => TRange[];
  replaceAll: (query: string, replacement: string) => number;
  replaceMatch: (range: TRange, replacement: string) => void;
  /**
   * Scrolls a match into view without taking focus.
   *
   * Focus has to stay wherever the caller put it — the find bar calls this on
   * every keystroke, and pulling focus into the document would send the next
   * character into the note, on top of the selected match.
   */
  revealMatch: (range: TRange) => void;
  scrollToBlock: (index: number) => void;
  toggleFold: (index: number) => void;
  value: () => Value;
}

export interface NoteEditorProps {
  autoFocus?: boolean;
  controllerRef?: Ref<NoteEditorController | null>;
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

/**
 * Pushes the find bar's query into the highlight plugin.
 *
 * Lives inside `<Plate>` because `useRedecorate` needs the editor store, and the
 * redecorate is not optional: setting a plugin option updates the option store
 * but does not re-run Slate's `decorate`, so the matches were counted correctly
 * while none of them were ever painted.
 */
function SearchHighlightSync({ search }: { search: string }) {
  const editor = useEditorRef();
  const redecorate = useRedecorate();

  // Written during render, not in an effect: Plate reads this option while
  // Slate builds its decorations, and that happens before effects run. This
  // component is the first child of `<Plate>`, so its render precedes the
  // editable's in the same pass.
  editor.setOption(FindReplacePlugin, "search", search);

  // Setting the option is not enough on its own — decorations are memoised, so
  // a later change (including clearing the query) would leave the previous
  // highlights painted. This invalidates them.
  useEffect(() => {
    redecorate();
  }, [redecorate, search]);

  return null;
}

/**
 * Reports folded state to the pane, whichever control changed it.
 *
 * Deliberately one-way. The gutter chevron writes the plugin option directly,
 * so the pane's copy went stale and the outline's chevrons inverted — a row
 * labelled "Collapse" would expand. Feeding the pane's state back in as a prop
 * fixes that but creates a loop: the prop sets the option, the option fires
 * this, which sets the prop. The plugin option is the single source of truth
 * and the pane mirrors it for display.
 */
function FoldSync({ onChange }: { onChange: ((indices: number[]) => void) | undefined }) {
  const folded = usePluginOption(HeadingFoldPlugin, "folded");

  useEffect(() => {
    onChange?.(folded);
  }, [folded, onChange]);

  return null;
}

/** `scrollIntoView` is missing on text nodes, and absent entirely in jsdom. */
function scrollIntoView(
  editor: PlateEditor,
  path: number[],
  block: ScrollLogicalPosition = "nearest",
) {
  const entry = editor.api.node(path);
  if (!entry) return;

  const node = editor.api.toDOMNode(entry[0] as never) as HTMLElement | undefined;
  node?.scrollIntoView?.({ block });
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

  useEffect(() => {
    editor.setOption(ImageUploadPlugin, "uploadImage", uploadImage ?? null);
  }, [editor, uploadImage]);

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
          markdown: serializeNoteMarkdown(changed),
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
      markdown: () => serializeNoteMarkdown(editor),
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
      revealMatch: (range) => {
        // Deliberately no `focus()` — see the interface comment.
        editor.tf.select(range);
        scrollIntoView(editor, range.anchor.path.slice(0, -1));
      },
      scrollToBlock: (index) => {
        scrollIntoView(editor, [index], "start");
      },
      toggleFold: (index) => {
        const folded = editor.getOption(HeadingFoldPlugin, "folded");
        editor.setOption(
          HeadingFoldPlugin,
          "folded",
          folded.includes(index) ? folded.filter((entry) => entry !== index) : [...folded, index],
        );
      },
      value: () => editor.children as Value,
    }),
    [editor],
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
        <SearchHighlightSync search={search} />
        <FoldSync onChange={onFoldedIndicesChange} />
        <EditorContainer className="note-editor-shell">
          <Editor className="note-editor-content" onMouseDown={handleEditorMouseDown} />
        </EditorContainer>
      </Plate>
    </TooltipProvider>
  );
}
