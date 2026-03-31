export type PaneType = "terminal" | "browser" | "editor" | "t3code" | "note";

export interface TerminalConfig {
  cwd?: string;
}

export interface BrowserConfig {
  url: string;
  zoom?: number;
}

export interface EditorConfig {
  folderPath?: string;
}

export interface T3CodeConfig {}

export interface NoteConfig {
  noteId: string;
}

export type PaneConfig = TerminalConfig | BrowserConfig | EditorConfig | T3CodeConfig | NoteConfig;

/** Discriminated union coupling `type` with the correct `config` shape. */
export type Pane =
  | { id: string; title: string; type: "terminal"; config: TerminalConfig }
  | { id: string; title: string; type: "browser"; config: BrowserConfig }
  | { id: string; title: string; type: "editor"; config: EditorConfig }
  | { id: string; title: string; type: "t3code"; config: T3CodeConfig }
  | { id: string; title: string; type: "note"; config: NoteConfig };

export type SplitDirection = "horizontal" | "vertical";

export type SplitNode =
  | { type: "leaf"; groupId: string }
  | { type: "branch"; direction: SplitDirection; children: SplitNode[]; sizes: number[] };

export interface PaneGroupTab {
  id: string;
  paneId: string;
}

export interface PaneGroup {
  id: string;
  tabs: PaneGroupTab[];
  activeTabId: string;
}

export type SidebarNode =
  | { type: "workspace"; workspaceId: string }
  | { type: "folder"; id: string; name: string; collapsed: boolean; children: SidebarNode[] };

export interface Workspace {
  id: string;
  name: string;
  root: SplitNode;
  focusedGroupId: string | null;
  /** When set, only this group is visible (maximized). Other groups are preserved in the tree. */
  zoomedGroupId: string | null;
  pinned?: boolean;
  lastActiveAt: number;
  /** Last known terminal CWD in this workspace — used as fallback for CWD inheritance. Persisted across restarts. */
  lastTerminalCwd?: string;
}
