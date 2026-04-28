import { useRef, useCallback } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { ChevronRight, FolderClosed, FolderOpen, Plus } from "lucide-react";

import { useActiveDrag } from "@/hooks/useDndOrchestrator";
import { useInsertionIndicator } from "@/hooks/useInsertionIndicator";
import type { SidebarNode } from "@/types/workspace";
import type { SidebarContainer } from "@/types/dnd";
import { cn } from "@/lib/utils";

import { InlineRenameInput } from "@/components/ui/inline-rename-input";
import { SidebarTreeLevel } from "./SidebarTreeLevel";
import { useSidebarContext } from "./SidebarContext";

interface SortableFolderItemProps {
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
}: SortableFolderItemProps) {
  const { filteredWorkspaceIds, onContextMenuFolder, onRenameFolder, onStopEditing } =
    useSidebarContext();
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

  const activeDrag = useActiveDrag();
  const isRelevantDrag =
    activeDrag?.type === "sidebar-workspace" ||
    activeDrag?.type === "sidebar-folder" ||
    activeDrag?.type === "group-tab";
  const insertPosition = useInsertionIndicator(
    isOver && !isDragging && isRelevantDrag,
    false,
    folderRef,
    "vertical",
    0.25,
  );
  const showDragOver = isOver && !isDragging && isRelevantDrag && insertPosition === null;
  const insertClass =
    insertPosition === "before"
      ? "insert-before"
      : insertPosition === "after"
        ? "insert-after"
        : "";

  const isExpanded = filteredWorkspaceIds ? true : !folder.collapsed;
  const FolderIcon = isExpanded ? FolderOpen : FolderClosed;

  return (
    <div style={{ opacity: isDragging ? 0.4 : undefined }}>
      <div
        ref={setFolderRef}
        data-sortable-id={`folder-${folder.id}`}
        onClick={onToggle}
        onContextMenu={(e) => onContextMenuFolder(e, folder.id)}
        style={{ marginLeft: depth * 14 }}
        {...attributes}
        {...listeners}
        className={cn(
          "no-drag relative group/folder flex items-center gap-1.5 h-8 pl-1.5 pr-1.5 rounded-md cursor-default select-none",
          "text-[12px] text-foreground/75 hover:text-foreground hover:bg-hover",
          "transition-colors duration-100",
          showDragOver && "drop-into-folder",
          insertClass,
        )}
      >
        <ChevronRight
          size={10}
          strokeWidth={2.4}
          className={cn(
            "shrink-0 transition-transform duration-150 text-muted-foreground/60",
            isExpanded && "rotate-90 text-muted-foreground",
          )}
        />
        <FolderIcon
          size={12}
          className={cn(
            "shrink-0 transition-colors",
            isExpanded ? "text-brand/85" : "text-muted-foreground/75",
          )}
        />
        {isEditing ? (
          <InlineRenameInput
            initialValue={folder.name}
            onCommit={(name) => {
              onRenameFolder(folder.id, name);
              onStopEditing();
            }}
            onCancel={onStopEditing}
            className="text-[12px]"
            aria-label="Rename folder"
          />
        ) : (
          <span className="flex-1 truncate text-foreground/85">{folder.name}</span>
        )}
        {!isEditing && (
          <button
            type="button"
            aria-label="Add workspace to folder"
            title="Add workspace"
            onClick={(e) => {
              e.stopPropagation();
              onAddWorkspace();
            }}
            className={cn(
              "shrink-0 inline-flex items-center justify-center size-4 rounded-sm",
              "text-muted-foreground/60 opacity-0 group-hover/folder:opacity-100",
              "hover:text-foreground hover:bg-hover transition-[opacity,color]",
            )}
          >
            <Plus size={11} strokeWidth={2.2} />
          </button>
        )}
      </div>

      {isExpanded && (
        <>
          <SidebarTreeLevel
            nodes={folder.children}
            container={container}
            parentFolderId={folder.id}
            depth={depth + 1}
          />
          {folder.children.length === 0 && (
            <div
              style={{ marginLeft: (depth + 1) * 14 + 18 }}
              className="px-2 py-1 text-[10px] text-muted-foreground/50 italic select-none"
            >
              Drop workspaces here
            </div>
          )}
        </>
      )}
    </div>
  );
}
