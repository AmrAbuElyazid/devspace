/**
 * NoteEditorKit — Plugin configuration for the note pane editor.
 *
 * Combines: basic nodes, marks, lists, links, code blocks, callouts,
 * autoformat, slash commands, floating toolbar, block selection, indent,
 * markdown serialization, and an ensure-paragraph normalizer.
 */

import type { NodeEntry } from "platejs";
import { createSlatePlugin, KEYS } from "platejs";
import { MarkdownPlugin } from "@platejs/markdown";

import { BasicNodesKit } from "./basic-nodes-kit";
import { AutoformatKit } from "./autoformat-kit";
import { SlashKit } from "./slash-kit";
import { ListKit } from "./list-kit";
import { LinkKit } from "./link-kit";
import { CodeBlockKit } from "./code-block-kit";
import { CalloutKit } from "./callout-kit";
import { IndentKit } from "./indent-kit";
import { FloatingToolbarKit } from "./floating-toolbar-kit";
import { BlockSelectionKit } from "./block-selection-kit";
import { BlockPlaceholderKit } from "./block-placeholder-kit";

/** Build the full plugin list for the note editor. */
export function createNoteEditorPlugins() {
  return [
    ...BasicNodesKit,
    ...ListKit,
    ...LinkKit,
    ...CodeBlockKit,
    ...CalloutKit,
    ...IndentKit,
    ...AutoformatKit,
    ...SlashKit,
    ...FloatingToolbarKit,
    ...BlockSelectionKit,
    ...BlockPlaceholderKit,
    MarkdownPlugin,

    // Ensure the editor always has at least one paragraph after select-all + delete
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
