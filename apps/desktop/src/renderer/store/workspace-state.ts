import type {
  Workspace,
  Pane,
  PaneType,
  PaneConfig,
  SplitDirection,
  PaneGroup,
  SidebarNode,
} from "../types/workspace";
import type { SidebarContainer, DropSide } from "../types/dnd";

// ---------------------------------------------------------------------------
// Store state + actions interface
// ---------------------------------------------------------------------------

export interface WorkspaceState {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  panes: Record<string, Pane>;
  paneGroups: Record<string, PaneGroup>;
  pinnedSidebarNodes: SidebarNode[];
  sidebarTree: SidebarNode[];
  /** Set by addWorkspace/addFolder when the newly created item should enter edit mode */
  pendingEditId: string | null;
  pendingEditType: "workspace" | "folder" | "tab" | null;
  clearPendingEdit: () => void;

  // Workspace CRUD
  addWorkspace: (
    name?: string,
    parentFolderId?: string | null,
    container?: SidebarContainer,
    defaultType?: PaneType,
  ) => string;
  removeWorkspace: (id: string) => void;
  renameWorkspace: (id: string, name: string) => void;
  setActiveWorkspace: (id: string) => void;
  togglePinWorkspace: (id: string) => void;
  pinWorkspace: (id: string) => void;
  unpinWorkspace: (id: string) => void;
  pinFolder: (folderId: string) => void;
  unpinFolder: (folderId: string) => void;

  // Sidebar tree actions
  reorderSidebarNode: (
    nodeId: string,
    nodeType: "workspace" | "folder",
    targetParentId: string | null,
    targetIndex: number,
  ) => void;
  moveSidebarNode: (args: {
    nodeId: string;
    nodeType: "workspace" | "folder";
    sourceContainer: SidebarContainer;
    targetContainer: SidebarContainer;
    targetParentId: string | null;
    targetIndex: number;
  }) => void;
  addFolder: (name: string, parentId?: string | null, container?: SidebarContainer) => string;
  removeFolder: (folderId: string) => void;
  renameFolder: (folderId: string, name: string) => void;
  toggleFolderCollapsed: (folderId: string) => void;
  expandFolder: (folderId: string) => void;

  // Focus
  setFocusedGroup: (workspaceId: string, groupId: string) => void;

  // Group tab CRUD
  addGroupTab: (workspaceId: string, groupId: string, defaultType?: PaneType) => void;
  removeGroupTab: (workspaceId: string, groupId: string, tabId: string) => void;
  setActiveGroupTab: (workspaceId: string, groupId: string, tabId: string) => void;
  reorderGroupTabs: (
    workspaceId: string,
    groupId: string,
    fromIndex: number,
    toIndex: number,
  ) => void;
  moveTabToGroup: (
    workspaceId: string,
    srcGroupId: string,
    tabId: string,
    destGroupId: string,
    insertIndex?: number,
  ) => void;
  splitGroupWithTab: (
    workspaceId: string,
    srcGroupId: string,
    tabId: string,
    targetGroupId: string,
    side: DropSide,
  ) => void;
  moveTabToWorkspace: (
    srcWorkspaceId: string,
    srcGroupId: string,
    tabId: string,
    destWorkspaceId: string,
  ) => void;
  mergeWorkspaceIntoGroup: (sourceWorkspaceId: string, targetGroupId: string) => void;
  splitGroupWithWorkspace: (
    sourceWorkspaceId: string,
    targetGroupId: string,
    side: DropSide,
  ) => void;
  createWorkspaceFromTab: (
    tabId: string,
    sourceGroupId: string,
    sourceWorkspaceId: string,
    opts?: {
      parentFolderId?: string | null;
      container?: SidebarContainer;
      insertIndex?: number;
    },
  ) => void;

  // Browser in group
  openBrowserInGroup: (workspaceId: string, groupId: string, url: string) => void;

  // Editor in active workspace (used by CLI open-editor)
  openEditorTab: (folderPath: string) => void;

  // Split operations
  splitGroup: (
    workspaceId: string,
    groupId: string,
    direction: SplitDirection,
    defaultType?: PaneType,
  ) => void;
  closeGroup: (workspaceId: string, groupId: string) => void;
  updateSplitSizes: (workspaceId: string, nodePath: number[], sizes: number[]) => void;

  // Navigation
  activateNextWorkspace: () => void;
  activatePrevWorkspace: () => void;
  activateNextTab: (workspaceId: string, groupId: string) => void;
  activatePrevTab: (workspaceId: string, groupId: string) => void;
  focusGroupInDirection: (workspaceId: string, direction: "left" | "right" | "up" | "down") => void;
  togglePaneZoom: (workspaceId: string) => void;

  // Pane operations
  addPane: (type: PaneType, config?: Partial<PaneConfig>) => string;
  removePane: (paneId: string) => void;
  updatePaneConfig: (paneId: string, updates: Partial<PaneConfig>) => void;
  updateBrowserPaneZoom: (paneId: string, zoom: number) => void;
  updatePaneTitle: (paneId: string, title: string) => void;
}

// ---------------------------------------------------------------------------
// Slice creator types
// ---------------------------------------------------------------------------

export type StoreGet = () => WorkspaceState;
export type StoreSet = {
  (partial: Partial<WorkspaceState>): void;
  (fn: (state: WorkspaceState) => Partial<WorkspaceState>): void;
};
