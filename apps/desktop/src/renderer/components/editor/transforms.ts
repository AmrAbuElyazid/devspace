import type { TElement } from "platejs";
import type { PlateEditor } from "platejs/react";

import { insertCallout } from "@platejs/callout";
import { insertCodeBlock } from "@platejs/code-block";
import { triggerFloatingLink } from "@platejs/link/react";
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

export interface InsertAction {
  icon: string;
  label: string;
  value: string;
  onSelect: (editor: PlateEditor) => void;
  focusEditor?: boolean;
  group?: string;
  keywords?: string[];
}

export const insertActions: InsertAction[] = [
  {
    focusEditor: false,
    group: "Basic blocks",
    icon: "Heading1",
    keywords: ["title", "h1"],
    label: "Heading 1",
    value: "h1",
    onSelect: (editor) => {
      editor.tf.toggleBlock(KEYS.h1);
    },
  },
  {
    focusEditor: false,
    group: "Basic blocks",
    icon: "Heading2",
    keywords: ["subtitle", "h2"],
    label: "Heading 2",
    value: "h2",
    onSelect: (editor) => {
      editor.tf.toggleBlock(KEYS.h2);
    },
  },
  {
    focusEditor: false,
    group: "Basic blocks",
    icon: "Heading3",
    keywords: ["subtitle", "h3"],
    label: "Heading 3",
    value: "h3",
    onSelect: (editor) => {
      editor.tf.toggleBlock(KEYS.h3);
    },
  },
  {
    focusEditor: false,
    group: "Basic blocks",
    icon: "List",
    keywords: ["unordered", "ul"],
    label: "Bulleted list",
    value: "ul",
    onSelect: (editor) => {
      toggleList(editor, { listStyleType: KEYS.ul });
    },
  },
  {
    focusEditor: false,
    group: "Basic blocks",
    icon: "ListOrdered",
    keywords: ["ordered", "ol"],
    label: "Numbered list",
    value: "ol",
    onSelect: (editor) => {
      toggleList(editor, { listStyleType: KEYS.ol });
    },
  },
  {
    focusEditor: false,
    group: "Basic blocks",
    icon: "ListTodo",
    keywords: ["checklist", "task", "checkbox", "[]"],
    label: "To-do list",
    value: "todo",
    onSelect: (editor) => {
      toggleList(editor, { listStyleType: KEYS.listTodo });
    },
  },
  {
    focusEditor: false,
    group: "Basic blocks",
    icon: "Quote",
    keywords: ["citation", "blockquote"],
    label: "Blockquote",
    value: "blockquote",
    onSelect: (editor) => {
      editor.tf.toggleBlock(KEYS.blockquote);
    },
  },
  {
    focusEditor: false,
    group: "Basic blocks",
    icon: "Minus",
    keywords: ["divider", "separator", "line"],
    label: "Divider",
    value: "hr",
    onSelect: (editor) => {
      editor.tf.setNodes({ type: KEYS.hr });
      editor.tf.insertNodes({
        children: [{ text: "" }],
        type: KEYS.p,
      });
    },
  },
  {
    group: "Basic blocks",
    icon: "Code2",
    keywords: ["```"],
    label: "Code block",
    value: "code_block",
    onSelect: (editor) => {
      insertCodeBlock(editor);
    },
  },
  {
    group: "Basic blocks",
    icon: "InfoIcon",
    keywords: ["note", "warning", "tip"],
    label: "Callout",
    value: "callout",
    onSelect: (editor) => {
      insertCallout(editor);
    },
  },
  {
    group: "Inline",
    icon: "Link",
    keywords: ["url"],
    label: "Link",
    value: "link",
    onSelect: (editor) => {
      triggerFloatingLink(editor, { focused: true });
    },
  },
];
