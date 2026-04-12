/**
 * NoteEditorKit — Plugin configuration for the note pane editor.
 *
 * Combines: basic nodes, marks, lists, links, code blocks, callouts,
 * autoformat, slash commands, floating toolbar, block selection, indent,
 * markdown serialization, and an ensure-paragraph normalizer.
 */

import { MarkdownPlugin } from "@platejs/markdown";
import type { NodeEntry } from "platejs";
import { createSlatePlugin, KEYS } from "platejs";

import { AutoformatKit } from "./autoformat-kit";
import { BasicNodesKit } from "./basic-nodes-kit";
import { BlockPlaceholderKit } from "./block-placeholder-kit";
import { BlockSelectionKit } from "./block-selection-kit";
import { CalloutKit } from "./callout-kit";
import { CodeBlockKit } from "./code-block-kit";
import { DndKit } from "./dnd-kit";
import { FloatingToolbarKit } from "./floating-toolbar-kit";
import { IndentKit } from "./indent-kit";
import { LinkKit } from "./link-kit";
import { ListKit } from "./list-kit";
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
    ...IndentKit,
    ...AutoformatKit,
    ...SlashKit,
    ...FloatingToolbarKit,
    ...BlockSelectionKit,
    ...BlockPlaceholderKit,
    ...DndKit,
    MarkdownPlugin,

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
