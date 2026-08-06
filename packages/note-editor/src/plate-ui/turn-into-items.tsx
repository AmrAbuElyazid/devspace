"use client";

/**
 * The block types a paragraph can become.
 *
 * Shared by the floating toolbar's "Turn into" dropdown and the block gutter
 * menu so the two can't drift. Every entry here must correspond to a plugin
 * registered in `createNoteEditorPlugins` and to a node the markdown layer can
 * round-trip — `turn-into-items.test.ts` enforces both. The list previously
 * advertised Toggle list, Code Drawing and 3 columns, none of which had a
 * plugin behind them, so picking one did nothing.
 */

import type { ReactNode } from "react";

import {
  FileCodeIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  Heading4Icon,
  Heading5Icon,
  Heading6Icon,
  LightbulbIcon,
  ListIcon,
  ListOrderedIcon,
  PilcrowIcon,
  QuoteIcon,
  SquareCheckIcon,
} from "lucide-react";
import { KEYS } from "platejs";

export interface TurnIntoItem {
  icon: ReactNode;
  keywords: string[];
  label: string;
  value: string;
}

export const turnIntoItems: TurnIntoItem[] = [
  { icon: <PilcrowIcon />, keywords: ["paragraph", "text"], label: "Text", value: KEYS.p },
  { icon: <Heading1Icon />, keywords: ["title", "h1"], label: "Heading 1", value: KEYS.h1 },
  { icon: <Heading2Icon />, keywords: ["subtitle", "h2"], label: "Heading 2", value: KEYS.h2 },
  { icon: <Heading3Icon />, keywords: ["subtitle", "h3"], label: "Heading 3", value: KEYS.h3 },
  { icon: <Heading4Icon />, keywords: ["h4"], label: "Heading 4", value: KEYS.h4 },
  { icon: <Heading5Icon />, keywords: ["h5"], label: "Heading 5", value: KEYS.h5 },
  { icon: <Heading6Icon />, keywords: ["h6"], label: "Heading 6", value: KEYS.h6 },
  {
    icon: <ListIcon />,
    keywords: ["unordered", "ul", "-"],
    label: "Bulleted list",
    value: KEYS.ul,
  },
  {
    icon: <ListOrderedIcon />,
    keywords: ["ordered", "ol", "1"],
    label: "Numbered list",
    value: KEYS.ol,
  },
  {
    icon: <SquareCheckIcon />,
    keywords: ["checklist", "task", "checkbox", "[]"],
    label: "To-do list",
    value: KEYS.listTodo,
  },
  {
    icon: <QuoteIcon />,
    keywords: ["citation", "blockquote", ">"],
    label: "Quote",
    value: KEYS.blockquote,
  },
  {
    icon: <LightbulbIcon />,
    keywords: ["note", "callout", "alert", "aside"],
    label: "Callout",
    value: KEYS.callout,
  },
  { icon: <FileCodeIcon />, keywords: ["```", "snippet"], label: "Code", value: KEYS.codeBlock },
];

/** List style types, which are set through `toggleList` rather than as a block type. */
export const LIST_TURN_INTO_VALUES: ReadonlySet<string> = new Set([
  KEYS.ul,
  KEYS.ol,
  KEYS.listTodo,
]);
