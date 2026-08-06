"use client";

/**
 * The `/` menu catalogue.
 *
 * Kept apart from the rendering component so `slash-items.test.ts` can assert
 * that every entry corresponds to a plugin that is actually registered — the
 * failure mode being a menu item that looks real and silently does nothing.
 */

import type { ReactNode } from "react";

import { insertCallout } from "@platejs/callout";
import { insertCodeBlock } from "@platejs/code-block";
import { toggleList } from "@platejs/list";
import { insertEquation, insertInlineEquation } from "@platejs/math";
import { insertTable } from "@platejs/table";
import {
  FileCodeIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  LightbulbIcon,
  ListIcon,
  ListOrderedIcon,
  MinusIcon,
  PilcrowIcon,
  QuoteIcon,
  RadicalIcon,
  SigmaIcon,
  SquareCheckIcon,
  TableIcon,
} from "lucide-react";
import { KEYS } from "platejs";
import type { PlateEditor } from "platejs/react";

export interface SlashItem {
  icon: ReactNode;
  keywords: string[];
  label: string;
  onSelect: (editor: PlateEditor) => void;
  value: string;
}

export interface SlashGroup {
  group: string;
  items: SlashItem[];
}

const toggleBlock = (type: string) => (editor: PlateEditor) => {
  editor.tf.toggleBlock(type);
};

const toggleListStyle = (listStyleType: string) => (editor: PlateEditor) => {
  toggleList(editor, { listStyleType });
};

export const slashGroups: SlashGroup[] = [
  {
    group: "Basic",
    items: [
      {
        icon: <PilcrowIcon />,
        keywords: ["paragraph", "body"],
        label: "Text",
        onSelect: toggleBlock(KEYS.p),
        value: KEYS.p,
      },
      {
        icon: <Heading1Icon />,
        keywords: ["title", "h1", "#"],
        label: "Heading 1",
        onSelect: toggleBlock(KEYS.h1),
        value: KEYS.h1,
      },
      {
        icon: <Heading2Icon />,
        keywords: ["subtitle", "h2", "##"],
        label: "Heading 2",
        onSelect: toggleBlock(KEYS.h2),
        value: KEYS.h2,
      },
      {
        icon: <Heading3Icon />,
        keywords: ["subtitle", "h3", "###"],
        label: "Heading 3",
        onSelect: toggleBlock(KEYS.h3),
        value: KEYS.h3,
      },
    ],
  },
  {
    group: "Lists",
    items: [
      {
        icon: <ListIcon />,
        keywords: ["unordered", "ul", "bullet", "-"],
        label: "Bulleted list",
        onSelect: toggleListStyle(KEYS.ul),
        value: KEYS.ul,
      },
      {
        icon: <ListOrderedIcon />,
        keywords: ["ordered", "ol", "numbered", "1."],
        label: "Numbered list",
        onSelect: toggleListStyle(KEYS.ol),
        value: KEYS.ol,
      },
      {
        icon: <SquareCheckIcon />,
        keywords: ["checklist", "task", "checkbox", "todo", "[]"],
        label: "To-do list",
        onSelect: toggleListStyle(KEYS.listTodo),
        value: KEYS.listTodo,
      },
    ],
  },
  {
    group: "Blocks",
    items: [
      {
        icon: <FileCodeIcon />,
        keywords: ["```", "snippet", "syntax"],
        label: "Code block",
        onSelect: (editor) => insertCodeBlock(editor),
        value: KEYS.codeBlock,
      },
      {
        icon: <QuoteIcon />,
        keywords: ["citation", "blockquote", ">"],
        label: "Quote",
        onSelect: toggleBlock(KEYS.blockquote),
        value: KEYS.blockquote,
      },
      {
        icon: <LightbulbIcon />,
        keywords: ["note", "callout", "alert", "aside", "warning", "tip"],
        label: "Callout",
        onSelect: (editor) => insertCallout(editor, { variant: "note" }),
        value: KEYS.callout,
      },
      {
        icon: <TableIcon />,
        keywords: ["table", "grid", "spreadsheet"],
        label: "Table",
        onSelect: (editor) => insertTable(editor, { colCount: 3, rowCount: 3 }),
        value: KEYS.table,
      },
      {
        icon: <MinusIcon />,
        keywords: ["divider", "separator", "line", "---", "hr"],
        label: "Divider",
        onSelect: (editor) => {
          editor.tf.setNodes({ type: KEYS.hr });
          editor.tf.insertNodes({ children: [{ text: "" }], type: KEYS.p });
        },
        value: KEYS.hr,
      },
    ],
  },
  {
    group: "Math",
    items: [
      {
        icon: <SigmaIcon />,
        keywords: ["equation", "latex", "tex", "math", "$$"],
        label: "Equation",
        onSelect: (editor) => insertEquation(editor),
        value: KEYS.equation,
      },
      {
        icon: <RadicalIcon />,
        keywords: ["inline equation", "latex", "tex", "math"],
        label: "Inline equation",
        onSelect: (editor) => insertInlineEquation(editor),
        value: KEYS.inlineEquation,
      },
    ],
  },
];

export const slashItems: SlashItem[] = slashGroups.flatMap((group) => group.items);
