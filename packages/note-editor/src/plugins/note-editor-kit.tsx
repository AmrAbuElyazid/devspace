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

import { TrailingBlockPlugin } from "platejs";

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

    // Guarantees a paragraph after the last block. Without it a note ending in
    // a code block, table or callout has nowhere to put the caret: clicking
    // below lands inside the block and there is no way to start a new one.
    // This also covers the empty-document case, so it replaces the
    // `ensure-paragraph` normalizer that used to live here.
    TrailingBlockPlugin,
  ];
}
