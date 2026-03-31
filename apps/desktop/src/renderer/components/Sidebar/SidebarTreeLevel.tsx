import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useModifierHeldContext } from "../../App";
import { getWorkspaceMetadata } from "./sidebar-utils";
import { SortableWorkspaceItem } from "./SortableWorkspaceItem";
import { SortableFolderItem } from "./SortableFolderItem";
import type { SidebarNode, Workspace, Pane, PaneGroup } from "../../types/workspace";
import type { SidebarContainer } from "../../types/dnd";

export interface SidebarTreeLevelProps {
  nodes: SidebarNode[];
  container: SidebarContainer;
  parentFolderId: string | null;
  depth: number;
  editingId: string | null;
  editingType: "workspace" | "folder" | null;
  filteredWorkspaceIds: Set<string> | null;
  onStartEditingFolder: (id: string) => void;
  onStartEditingWorkspace: (id: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onRenameWorkspace: (id: string, name: string) => void;
  onStopEditing: () => void;
  onContextMenuFolder: (e: React.MouseEvent, folderId: string) => void;
  onContextMenuWorkspace: (e: React.MouseEvent, workspaceId: string) => void;
  onSelectWorkspace: (id: string) => void;
  onAddWorkspaceToFolder: (folderId: string, container: SidebarContainer) => void;
  activeWorkspaceId: string;
  workspaces: Workspace[];
  panes: Record<string, Pane>;
  paneGroups: Record<string, PaneGroup>;
  toggleFolderCollapsed: (folderId: string) => void;
  deleteTarget: string | null;
  setDeleteTarget: (id: string | null) => void;
}

export function SidebarTreeLevel({
  nodes,
  container,
  parentFolderId,
  depth,
  editingId,
  editingType,
  filteredWorkspaceIds,
  onStartEditingFolder,
  onStartEditingWorkspace,
  onRenameFolder,
  onRenameWorkspace,
  onStopEditing,
  onContextMenuFolder,
  onContextMenuWorkspace,
  onSelectWorkspace,
  onAddWorkspaceToFolder,
  activeWorkspaceId,
  workspaces,
  panes,
  paneGroups,
  toggleFolderCollapsed,
  deleteTarget,
  setDeleteTarget,
}: SidebarTreeLevelProps) {
  const sortableIds = nodes.map((n) =>
    n.type === "workspace" ? `ws-${n.workspaceId}` : `folder-${n.id}`,
  );
  const modifierHeld = useModifierHeldContext();

  return (
    <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
      {nodes.map((node) => {
        if (node.type === "workspace") {
          // Skip if filtered out
          if (filteredWorkspaceIds && !filteredWorkspaceIds.has(node.workspaceId)) return null;
          const ws = workspaces.find((w) => w.id === node.workspaceId);
          if (!ws) return null;
          const metadata = getWorkspaceMetadata(ws, panes, paneGroups);
          // Show ⌘1-8 for first 8 workspaces, ⌘9 for the last (when index >= 8).
          const wsIndex = workspaces.indexOf(ws);
          const isLast = wsIndex === workspaces.length - 1;
          let shortcutHint: string | null = null;
          if (modifierHeld === "command" && wsIndex >= 0) {
            if (wsIndex < 8) {
              shortcutHint = `⌘${wsIndex + 1}`;
            } else if (isLast) {
              shortcutHint = "⌘9";
            }
          }
          return (
            <SortableWorkspaceItem
              key={`ws-${ws.id}`}
              workspaceId={ws.id}
              container={container}
              parentFolderId={parentFolderId}
              depth={depth}
              isActive={ws.id === activeWorkspaceId}
              isEditing={editingId === ws.id && editingType === "workspace"}
              name={ws.name}
              metadata={metadata}
              shortcutHint={shortcutHint}
              canDelete={workspaces.length > 1}
              onSelect={() => onSelectWorkspace(ws.id)}
              onStartEditing={() => onStartEditingWorkspace(ws.id)}
              onRename={(name) => onRenameWorkspace(ws.id, name)}
              onStopEditing={onStopEditing}
              onContextMenu={(e) => onContextMenuWorkspace(e, ws.id)}
              onDelete={() => setDeleteTarget(ws.id)}
            />
          );
        }

        // folder node
        return (
          <SortableFolderItem
            key={`folder-${node.id}`}
            folder={node}
            container={container}
            parentFolderId={parentFolderId}
            depth={depth}
            isEditing={editingId === node.id && editingType === "folder"}
            editingId={editingId}
            editingType={editingType}
            filteredWorkspaceIds={filteredWorkspaceIds}
            onToggle={() => toggleFolderCollapsed(node.id)}
            onAddWorkspace={() => onAddWorkspaceToFolder(node.id, container)}
            onAddWorkspaceToFolder={onAddWorkspaceToFolder}
            onStartEditingFolder={onStartEditingFolder}
            onStartEditingWorkspace={onStartEditingWorkspace}
            onRenameFolder={onRenameFolder}
            onRenameWorkspace={onRenameWorkspace}
            onStopEditing={onStopEditing}
            onContextMenuFolder={onContextMenuFolder}
            onContextMenuWorkspace={onContextMenuWorkspace}
            onSelectWorkspace={onSelectWorkspace}
            activeWorkspaceId={activeWorkspaceId}
            workspaces={workspaces}
            panes={panes}
            paneGroups={paneGroups}
            toggleFolderCollapsed={toggleFolderCollapsed}
            deleteTarget={deleteTarget}
            setDeleteTarget={setDeleteTarget}
          />
        );
      })}
    </SortableContext>
  );
}
