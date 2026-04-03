import type { ComponentType, SVGProps } from "react";
import {
  TerminalIcon,
  VSCodeIcon,
  T3CodeIcon,
  NoteIcon,
  BrowserIcon,
} from "../components/icons/pane-icons";
import type { PaneType } from "../types/workspace";

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;

/**
 * Icon component for each pane type. All custom SVGs with a consistent
 * style — accepts `size`, `className`, and standard SVG props.
 */
export const paneTypeIcons: Record<PaneType, IconComponent> = {
  terminal: TerminalIcon,
  editor: VSCodeIcon,
  browser: BrowserIcon,
  t3code: T3CodeIcon,
  note: NoteIcon,
};

export const paneTypeLabels: Record<PaneType, string> = {
  terminal: "Terminal",
  editor: "VS Code",
  browser: "Browser",
  t3code: "T3 Code",
  note: "Note",
};
