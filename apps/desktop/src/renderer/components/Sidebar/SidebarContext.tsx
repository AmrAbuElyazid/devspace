import { createContext, useContext } from "react";
import type { Workspace, Pane, PaneGroup } from "../../types/workspace";
import type { SidebarContainer } from "../../types/dnd";

export interface SidebarContextValue {
  // Editing state
  editingId: string | null;
  editingType: "workspace" | "folder" | null;
  onStartEditingFolder: (id: string) => void;
  onStartEditingWorkspace: (id: string) => void;
  onStopEditing: () => void;
  onRenameFolder: (id: string, name: string) => void;
  onRenameWorkspace: (id: string, name: string) => void;

  // Selection & filtering
  activeWorkspaceId: string;
  filteredWorkspaceIds: Set<string> | null;
  onSelectWorkspace: (id: string) => void;

  // Context menus
  onContextMenuFolder: (e: React.MouseEvent, folderId: string) => void;
  onContextMenuWorkspace: (e: React.MouseEvent, workspaceId: string) => void;

  // Folder operations
  toggleFolderCollapsed: (folderId: string) => void;
  onAddWorkspaceToFolder: (folderId: string, container: SidebarContainer) => void;

  // Data for metadata computation
  workspaces: Workspace[];
  panes: Record<string, Pane>;
  paneGroups: Record<string, PaneGroup>;

  // Delete state
  deleteTarget: string | null;
  setDeleteTarget: (id: string | null) => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export const SidebarProvider = SidebarContext.Provider;

export function useSidebarContext(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebarContext must be used within a SidebarProvider");
  return ctx;
}
