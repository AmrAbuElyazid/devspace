interface PersistedTerminalConfig {
  cwd?: string;
}

interface PersistedBrowserConfig {
  url: string;
  zoom?: number;
}

interface PersistedEditorConfig {
  folderPath?: string;
}

interface PersistedT3CodeConfig {}

interface PersistedNoteConfig {
  noteId: string;
}

export type PersistedPane =
  | { id: string; title: string; type: "terminal"; config: PersistedTerminalConfig }
  | { id: string; title: string; type: "browser"; config: PersistedBrowserConfig }
  | { id: string; title: string; type: "editor"; config: PersistedEditorConfig }
  | { id: string; title: string; type: "t3code"; config: PersistedT3CodeConfig }
  | { id: string; title: string; type: "note"; config: PersistedNoteConfig };

export type PersistedSplitDirection = "horizontal" | "vertical";

export type PersistedSplitNode =
  | { type: "leaf"; groupId: string }
  | {
      type: "branch";
      direction: PersistedSplitDirection;
      children: PersistedSplitNode[];
      sizes: number[];
    };

export interface PersistedPaneGroupTab {
  id: string;
  paneId: string;
}

export interface PersistedPaneGroup {
  id: string;
  tabs: PersistedPaneGroupTab[];
  activeTabId: string;
}

export type PersistedSidebarNode =
  | { type: "workspace"; workspaceId: string }
  | {
      type: "folder";
      id: string;
      name: string;
      collapsed: boolean;
      children: PersistedSidebarNode[];
    };

export interface PersistedWorkspace {
  id: string;
  name: string;
  root: PersistedSplitNode;
  focusedGroupId: string | null;
  zoomedGroupId: string | null;
  pinned?: boolean;
  lastActiveAt: number;
  lastTerminalCwd?: string;
}

export interface PersistedWorkspaceState {
  workspaces: PersistedWorkspace[];
  activeWorkspaceId: string;
  panes: Record<string, PersistedPane>;
  paneGroups: Record<string, PersistedPaneGroup>;
  pinnedSidebarNodes: PersistedSidebarNode[];
  sidebarTree: PersistedSidebarNode[];
}
