import { useRef, useCallback } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { Check, ChevronRight, Plus } from "lucide-react";

import { useActiveDrag } from "@/hooks/useDndOrchestrator";
import { useInsertionIndicator } from "@/hooks/useInsertionIndicator";
import type { SidebarNode } from "@/types/workspace";
import type { SidebarContainer } from "@/types/dnd";
import { cn } from "@/lib/utils";

import { InlineRenameInput } from "@/components/ui/inline-rename-input";
import { SidebarTreeLevel } from "./SidebarTreeLevel";

/** Total workspaces under a folder, nested folders included. */
function countWorkspaces(nodes: SidebarNode[]): number {
  let total = 0;
  for (const node of nodes) {
    total += node.type === "workspace" ? 1 : countWorkspaces(node.children);
  }
  return total;
}

import { useSidebarContext } from "./SidebarContext";

interface SortableFolderItemProps {
  folder: SidebarNode & { type: "folder" };
  container: SidebarContainer;
  parentFolderId: string | null;
  depth: number;
  isEditing: boolean;
  isSelected: boolean;
  onClick: (event: React.MouseEvent) => void;
  onAddWorkspace: () => void;
}

export function SortableFolderItem({
  folder,
  container,
  parentFolderId,
  depth,
  isEditing,
  isSelected,
  onClick,
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

  const workspaceCount = countWorkspaces(folder.children);
  const isExpanded = filteredWorkspaceIds ? true : !folder.collapsed;

  return (
    <div style={{ opacity: isDragging ? 0.4 : undefined }} className="flex flex-col gap-[2px]">
      <div
        ref={setFolderRef}
        data-sortable-id={`folder-${folder.id}`}
        data-selected={isSelected || undefined}
        onClick={onClick}
        onContextMenu={(e) => onContextMenuFolder(e, folder.id)}
        style={{ marginLeft: depth * 13 }}
        {...attributes}
        {...listeners}
        className={cn(
          // gap-1.5 around a 12px chevron and a 14px folder puts the label at
          // the same x as a workspace label one level in, so a folder and its
          // contents read as one column rather than two.
          "group/folder flex items-center gap-1.5 rounded-md px-1.5 h-6 mt-1",
          "chrome-focus no-drag cursor-default select-none transition-colors duration-100",
          "text-muted-foreground hover:bg-row-hover hover:text-foreground",
          showDragOver && "drop-into-folder",
          insertClass,
        )}
      >
        <ChevronRight
          size={10}
          strokeWidth={2.4}
          className={cn("shrink-0 transition-transform duration-150", isExpanded && "rotate-90")}
        />
        {isSelected ? <Check size={12} strokeWidth={2.4} className="shrink-0 text-brand" /> : null}
        {isEditing ? (
          <InlineRenameInput
            initialValue={folder.name}
            onCommit={(name) => {
              onRenameFolder(folder.id, name);
              onStopEditing();
            }}
            onCancel={onStopEditing}
            className="text-ui-sm"
            aria-label="Rename folder"
          />
        ) : (
          // Uppercase and small: a folder is a heading over its rows, not a
          // sibling of them, so it must not compete with the workspace names.
          <span className="flex-1 truncate text-ui-xs font-medium tracking-[0.06em] uppercase">
            {folder.name}
          </span>
        )}
        {!isEditing && workspaceCount > 0 ? (
          <span className="shrink-0 font-mono text-ui-micro tabular-nums opacity-55">
            {workspaceCount}
          </span>
        ) : null}
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
              "chrome-focus shrink-0 inline-flex items-center justify-center size-5 rounded-md",
              "text-muted-foreground opacity-0 group-hover/folder:opacity-100 focus-visible:opacity-100",
              "hover:text-foreground hover:bg-row-hover transition-[opacity,color,background-color]",
            )}
          >
            <Plus size={12} strokeWidth={2.2} />
          </button>
        )}
      </div>

      {isExpanded && (
        // A hairline down the children's leading edge. Indentation alone stops
        // being readable past one level; the guide makes the nesting legible
        // without adding another glyph to every row.
        <div className="relative">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 w-px bg-border"
            style={{ left: (depth + 1) * 13 - 6 }}
          />
          <SidebarTreeLevel
            nodes={folder.children}
            container={container}
            parentFolderId={folder.id}
            depth={depth + 1}
          />
          {folder.children.length === 0 && (
            <div
              style={{ marginLeft: (depth + 1) * 13 }}
              className="px-2.5 py-1 text-ui-micro text-muted-foreground select-none"
            >
              Drop workspaces here
            </div>
          )}
        </div>
      )}
    </div>
  );
}
