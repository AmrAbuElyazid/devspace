import type { TElement } from "platejs";
import type { PlateEditor } from "platejs/react";

import { toggleList } from "@platejs/list";
import { KEYS } from "platejs";

/** Get the block type of the current selection's first block. */
export function getBlockType(editor: PlateEditor): string {
  const entry = editor.api?.block?.();
  if (!entry) return KEYS.p;
  const [node] = entry;
  return (node as TElement).type ?? KEYS.p;
}

/** Set the block type of the current selection. Handles list types via toggleList. */
export function setBlockType(editor: PlateEditor, type: string): void {
  if (!editor.tf) return;
  const listTypes: Set<string> = new Set([KEYS.ul, KEYS.ol, KEYS.listTodo]);

  if (listTypes.has(type)) {
    toggleList(editor, { listStyleType: type });
    return;
  }

  // For non-list types, remove list if currently in one, then set type
  const currentType = getBlockType(editor);
  if (listTypes.has(currentType)) {
    // Remove list first
    toggleList(editor, { listStyleType: currentType });
  }

  editor.tf.toggleBlock(type);
}
