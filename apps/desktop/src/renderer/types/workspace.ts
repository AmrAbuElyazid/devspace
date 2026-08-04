import type { BrowserViewportSetting } from "../lib/browser-viewport";

export type PaneType = "terminal" | "browser" | "editor" | "t3code" | "note";

export interface DirectTerminalConfig {
  cwd?: string;
  /** Missing on panes created before managed sessions were introduced. */
  backend?: "direct";
}

export interface ManagedTmuxTerminalConfig {
  cwd?: string;
  backend: "managed-tmux";
  sessionId: string;
}

export interface ExternalTmuxTerminalConfig {
  cwd?: string;
  backend: "external-tmux";
  sessionName: string;
  socketPath?: string;
}

export type TerminalConfig =
  | DirectTerminalConfig
  | ManagedTmuxTerminalConfig
  | ExternalTmuxTerminalConfig;

export interface BrowserConfig {
  url: string;
  /**
   * The user's zoom level. Authoritative — the factor handed to Electron also
   * carries device mode's fit-to-panel scale, so it must not be read back from
   * runtime state. See `resolveBrowserViewportLayout`.
   */
  zoom?: number;
  /** Responsive-design mode. Absent means fill the pane. */
  viewport?: BrowserViewportSetting;
}

export interface EditorConfig {
  folderPath?: string;
}

export interface T3CodeConfig {}

export interface NoteConfig {
  noteId: string;
}

export interface PaneConfigByType {
  terminal: TerminalConfig;
  browser: BrowserConfig;
  editor: EditorConfig;
  t3code: T3CodeConfig;
  note: NoteConfig;
}

export type PaneConfig = PaneConfigByType[PaneType];

export type PaneOfType<T extends PaneType> = T extends PaneType
  ? {
      id: string;
      title: string;
      type: T;
      config: PaneConfigByType[T];
    }
  : never;

/** Discriminated union coupling `type` with the correct `config` shape. */
export type Pane = PaneOfType<PaneType>;

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
