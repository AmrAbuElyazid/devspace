import type { SerializeMdOptions } from "@platejs/markdown";
import { MarkdownPlugin } from "@platejs/markdown";
import type { SlateEditor } from "platejs";

/**
 * Serialize to the markdown that gets written to disk.
 *
 * `preserveEmptyParagraphs` defaults to true, which emits a literal U+200B
 * zero-width space for every empty paragraph. That is invisible in the editor
 * but real bytes in the file: it shows up in grep, in diffs, and as a stray
 * character in any other editor. Since the trailing-block rule guarantees a
 * paragraph after the last block, every note ending in a code block, table or
 * image would carry one.
 *
 * Markdown cannot represent a blank paragraph in the first place — consecutive
 * blank lines collapse on the way back in — so preserving them buys nothing and
 * costs portability, which is the reason notes are markdown at all.
 */
export function serializeNoteMarkdown(
  editor: SlateEditor,
  options: Omit<SerializeMdOptions, "editor"> = {},
): string {
  return editor.getApi(MarkdownPlugin).markdown.serialize({
    preserveEmptyParagraphs: false,
    ...options,
  });
}
