/**
 * NoteEditorKit — plugin configuration for the note pane editor.
 *
 * Combines: basic nodes and marks, lists, links, code blocks, callouts, tables,
 * math, images, indentation, autoformat, slash commands, the floating toolbar,
 * block selection and dragging, heading folding, find highlighting, markdown
 * serialization, and an ensure-paragraph normalizer.
 *
 * Anything added here that the markdown layer cannot represent will make notes
 * unsaveable — `markdown-round-trip.test.ts` is the gate for that, and
 * `menu-integrity.test.ts` is the gate for the reverse mistake of offering a
 * block whose plugin was never registered.
 */

import type { NodeEntry } from "platejs";
import { createSlatePlugin, KEYS } from "platejs";

import { AutoformatKit } from "./autoformat-kit";
import { BasicNodesKit } from "./basic-nodes-kit";
import { BlockPlaceholderKit } from "./block-placeholder-kit";
import { BlockSelectionKit } from "./block-selection-kit";
import { CalloutKit } from "./callout-kit";
import { CodeBlockKit } from "./code-block-kit";
import { DndKit } from "./dnd-kit";
import { FindReplaceKit } from "./find-replace-kit";
import { FloatingToolbarKit } from "./floating-toolbar-kit";
import { HeadingFoldKit } from "./heading-fold-kit";
import { IndentKit } from "./indent-kit";
import { LinkKit } from "./link-kit";
import { ListKit } from "./list-kit";
import { MarkdownKit } from "./markdown-kit";
import { MathKit } from "./math-kit";
import { MediaKit } from "./media-kit";
import { SlashKit } from "./slash-kit";
import { TableKit } from "./table-kit";

/** Build the full plugin list for the note editor. */
export function createNoteEditorPlugins() {
  return [
    ...BasicNodesKit,
    ...ListKit,
    ...LinkKit,
    ...CodeBlockKit,
    ...CalloutKit,
    ...TableKit,
    ...MathKit,
    ...MediaKit,
    ...IndentKit,
    ...AutoformatKit,
    ...SlashKit,
    ...FloatingToolbarKit,
    ...BlockSelectionKit,
    ...BlockPlaceholderKit,
    ...HeadingFoldKit,
    ...DndKit,
    ...FindReplaceKit,
    ...MarkdownKit,

    createSlatePlugin({
      key: "ensure-paragraph",
      extendEditor: ({ editor }) => {
        const { normalizeNode } = editor;
        Object.assign(editor, {
          normalizeNode(entry: NodeEntry, options?: unknown) {
            const [node, path] = entry;
            if (
              path.length === 0 &&
              "children" in node &&
              (node.children as unknown[]).length === 0
            ) {
              editor.tf.insertNodes({ type: KEYS.p, children: [{ text: "" }] }, { at: [0] });
              return;
            }
            (normalizeNode as (entry: NodeEntry, options?: unknown) => void)(entry, options);
          },
        });
        return editor;
      },
    }),
  ];
}
