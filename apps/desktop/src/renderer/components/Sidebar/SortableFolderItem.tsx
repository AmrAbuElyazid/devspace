import { useRef, useCallback } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { ChevronDown, ChevronRight, FolderClosed, FolderOpen, Plus } from "lucide-react";
import { useDragContext } from "../../hooks/useDndOrchestrator";
import { useInsertionIndicator } from "../../hooks/useInsertionIndicator";
import { InlineRenameInput } from "../ui/InlineRenameInput";
import { SidebarTreeLevel, type SidebarTreeLevelProps } from "./SidebarTreeLevel";
import type { SidebarNode } from "../../types/workspace";
import type { SidebarContainer } from "../../types/dnd";

interface SortableFolderItemProps extends Omit<
  SidebarTreeLevelProps,
  "nodes" | "container" | "parentFolderId" | "depth"
> {
  folder: SidebarNode & { type: "folder" };
  container: SidebarContainer;
  parentFolderId: string | null;
  depth: number;
  isEditing: boolean;
  onToggle: () => void;
  onAddWorkspace: () => void;
}

export function SortableFolderItem({
  folder,
  container,
  parentFolderId,
  depth,
  isEditing,
  onToggle,
  onAddWorkspace,
  // SidebarTreeLevel passthrough props:
  onAddWorkspaceToFolder,
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
  activeWorkspaceId,
  workspaces,
  panes,
  paneGroups,
  toggleFolderCollapsed,
  deleteTarget,
  setDeleteTarget,
}: SortableFolderItemProps) {
  const folderRef = useRef<HTMLDivElement | null>(null);

  const { attributes, listeners, setNodeRef, isDragging, isOver } = useSortable({
    id: `folder-${folder.id}`,
    data: {
      type: "sidebar-folder" as const,
      folderId: folder.id,
      container,
      parentFolderId,
      visible: true,
    },
  });

  const setFolderRef = useCallback(
    (el: HTMLDivElement | null) => {
      folderRef.current = el;
      setNodeRef(el);
    },
    [setNodeRef],
  );

  // Folder uses edge zones (0.25 threshold): edges show insertion line, center shows folder highlight
  const { activeDrag: activeDragCtx } = useDragContext();
  const isRelevantDrag =
    activeDragCtx?.type === "sidebar-workspace" ||
    activeDragCtx?.type === "sidebar-folder" ||
    activeDragCtx?.type === "group-tab";
  const insertPosition = useInsertionIndicator(
    isOver && !isDragging && isRelevantDrag,
    false,
    folderRef,
    "vertical",
    0.25,
  );

  // Show folder highlight only when pointer is in center zone (insertPosition === null means center)
  const showDragOver = isOver && !isDragging && isRelevantDrag && insertPosition === null;
  const insertClass =
    insertPosition === "before"
      ? "sidebar-insert-before"
      : insertPosition === "after"
        ? "sidebar-insert-after"
        : "";

  // When filtering, force folders expanded
  const isExpanded = filteredWorkspaceIds ? true : !folder.collapsed;

  return (
    <div style={{ opacity: isDragging ? 0.4 : undefined }}>
      <div
        ref={setFolderRef}
        data-sortable-id={`folder-${folder.id}`}
        className={`folder-header no-drag ${showDragOver ? "sidebar-item-drag-over-folder" : ""} ${insertClass}`}
        onClick={onToggle}
        onContextMenu={(e) => onContextMenuFolder(e, folder.id)}
        style={{ marginLeft: depth * 16 }}
        {...attributes}
        {...listeners}
      >
        {!isExpanded ? (
          <ChevronRight size={10} className="folder-chevron" />
        ) : (
          <ChevronDown size={10} className="folder-chevron" />
        )}
        {isExpanded ? (
          <FolderOpen size={11} className="folder-icon" />
        ) : (
          <FolderClosed size={11} className="folder-icon" />
        )}
        {isEditing ? (
          <InlineRenameInput
            initialValue={folder.name}
            onCommit={(name) => {
              onRenameFolder(folder.id, name);
              onStopEditing();
            }}
            onCancel={onStopEditing}
            className="text-[11px]"
          />
        ) : (
          <span className="flex-1 truncate">{folder.name}</span>
        )}
        {!isEditing && (
          <button
            type="button"
            className="folder-add-btn"
            title="Add workspace"
            onClick={(e) => {
              e.stopPropagation();
              onAddWorkspace();
            }}
          >
            <Plus size={12} />
          </button>
        )}
      </div>

      {isExpanded && (
        <SidebarTreeLevel
          nodes={folder.children}
          container={container}
          parentFolderId={folder.id}
          depth={depth + 1}
          editingId={editingId}
          editingType={editingType}
          filteredWorkspaceIds={filteredWorkspaceIds}
          onStartEditingFolder={onStartEditingFolder}
          onStartEditingWorkspace={onStartEditingWorkspace}
          onRenameFolder={onRenameFolder}
          onRenameWorkspace={onRenameWorkspace}
          onStopEditing={onStopEditing}
          onContextMenuFolder={onContextMenuFolder}
          onContextMenuWorkspace={onContextMenuWorkspace}
          onSelectWorkspace={onSelectWorkspace}
          onAddWorkspaceToFolder={onAddWorkspaceToFolder}
          activeWorkspaceId={activeWorkspaceId}
          workspaces={workspaces}
          panes={panes}
          paneGroups={paneGroups}
          toggleFolderCollapsed={toggleFolderCollapsed}
          deleteTarget={deleteTarget}
          setDeleteTarget={setDeleteTarget}
        />
      )}
    </div>
  );
}
