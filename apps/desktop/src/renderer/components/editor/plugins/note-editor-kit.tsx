/**
 * NoteEditorKit — Plugin configuration for the note pane editor.
 *
 * Combines: basic nodes, marks, lists, links, code blocks, callouts,
 * autoformat, slash commands, floating toolbar, block selection, indent.
 * Also includes TrailingBlockPlugin to prevent empty editor after select-all delete.
 */

import type { NodeEntry } from "platejs";
import { createSlatePlugin, KEYS } from "platejs";

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

export const NoteEditorKit = [
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

  // Ensure the editor always has at least one paragraph after select-all + delete
  createSlatePlugin({
    key: "ensure-paragraph",
    extendEditor: ({ editor }) => {
      const orig = editor.normalizeNode as (entry: NodeEntry, options?: unknown) => void;
      (editor as any).normalizeNode = (entry: NodeEntry, options?: unknown) => {
        const [node, path] = entry;
        // At the root level, if there are no children, insert an empty paragraph
        if (path.length === 0 && "children" in node && (node.children as unknown[]).length === 0) {
          editor.tf.insertNodes({ type: KEYS.p, children: [{ text: "" }] }, { at: [0] });
          return;
        }
        orig(entry, options);
      };
      return editor;
    },
  }),
];
