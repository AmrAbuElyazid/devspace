import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useModifierHeldContext } from "../../App";
import { SortableWorkspaceItem } from "./SortableWorkspaceItem";
import { SortableFolderItem } from "./SortableFolderItem";
import { useSidebarContext } from "./SidebarContext";
import type { SidebarNode } from "../../types/workspace";
import type { SidebarContainer } from "../../types/dnd";

interface SidebarTreeLevelProps {
  nodes: SidebarNode[];
  container: SidebarContainer;
  parentFolderId: string | null;
  depth: number;
}

export function SidebarTreeLevel({
  nodes,
  container,
  parentFolderId,
  depth,
}: SidebarTreeLevelProps) {
  const {
    editingId,
    editingType,
    filteredWorkspaceIds,
    onStartEditingWorkspace,
    onRenameWorkspace,
    onStopEditing,
    onContextMenuWorkspace,
    onSelectWorkspace,
    onAddWorkspaceToFolder,
    activeWorkspaceId,
    toggleFolderCollapsed,
    setDeleteTarget,
  } = useSidebarContext();

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
          return (
            <SortableWorkspaceItem
              key={`ws-${node.workspaceId}`}
              workspaceId={node.workspaceId}
              container={container}
              parentFolderId={parentFolderId}
              depth={depth}
              isActive={node.workspaceId === activeWorkspaceId}
              isEditing={editingId === node.workspaceId && editingType === "workspace"}
              modifierHeld={modifierHeld}
              onSelect={() => onSelectWorkspace(node.workspaceId)}
              onStartEditing={() => onStartEditingWorkspace(node.workspaceId)}
              onRename={(name) => onRenameWorkspace(node.workspaceId, name)}
              onStopEditing={onStopEditing}
              onContextMenu={(e) => onContextMenuWorkspace(e, node.workspaceId)}
              onDelete={() => setDeleteTarget(node.workspaceId)}
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
            onToggle={() => toggleFolderCollapsed(node.id)}
            onAddWorkspace={() => onAddWorkspaceToFolder(node.id, container)}
          />
        );
      })}
    </SortableContext>
  );
}
