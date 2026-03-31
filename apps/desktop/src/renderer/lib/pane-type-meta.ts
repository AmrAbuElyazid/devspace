import { Terminal, FileCode, Globe, Bot, StickyNote } from "lucide-react";
import type { PaneType } from "../types/workspace";

export const paneTypeIcons: Record<PaneType, typeof Terminal> = {
  terminal: Terminal,
  editor: FileCode,
  browser: Globe,
  t3code: Bot,
  note: StickyNote,
};

export const paneTypeLabels: Record<PaneType, string> = {
  terminal: "Terminal",
  editor: "VS Code",
  browser: "Browser",
  t3code: "T3 Code",
  note: "Note",
};
