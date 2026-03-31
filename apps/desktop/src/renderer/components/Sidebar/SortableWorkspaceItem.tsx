import { useRef, useCallback } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { X } from "lucide-react";
import { useDragContext } from "../../hooks/useDndOrchestrator";
import { useInsertionIndicator } from "../../hooks/useInsertionIndicator";
import { InlineRenameInput } from "../ui/InlineRenameInput";
import type { SidebarContainer } from "../../types/dnd";

interface SortableWorkspaceItemProps {
  workspaceId: string;
  container: SidebarContainer;
  parentFolderId: string | null;
  depth: number;
  isActive: boolean;
  isEditing: boolean;
  name: string;
  metadata: string;
  shortcutHint: string | null;
  canDelete: boolean;
  onSelect: () => void;
  onStartEditing: () => void;
  onRename: (name: string) => void;
  onStopEditing: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDelete: () => void;
}

export function SortableWorkspaceItem({
  workspaceId,
  container,
  parentFolderId,
  depth,
  isActive,
  isEditing,
  name,
  metadata,
  shortcutHint,
  canDelete,
  onSelect,
  onStartEditing,
  onRename,
  onStopEditing,
  onContextMenu,
  onDelete,
}: SortableWorkspaceItemProps) {
  const { activeDrag } = useDragContext();
  const mergedRef = useRef<HTMLDivElement | null>(null);

  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    isDragging,
    isOver,
  } = useSortable({
    id: `ws-${workspaceId}`,
    data: {
      type: "sidebar-workspace" as const,
      workspaceId,
      container,
      parentFolderId,
      visible: true,
    },
  });

  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      mergedRef.current = el;
      setSortableRef(el);
    },
    [setSortableRef],
  );

  // Insertion line indicator — items stay in place, line shows where drop will go
  const isSidebarDrag =
    activeDrag?.type === "sidebar-workspace" || activeDrag?.type === "sidebar-folder";
  const insertPosition = useInsertionIndicator(
    isOver && !isDragging && isSidebarDrag,
    false,
    mergedRef,
    "vertical",
  );

  // Insertion line for tab drags (edge zones only — center zone stays as tab drop target)
  const isTabDrag = activeDrag?.type === "group-tab";
  const tabInsertPosition = useInsertionIndicator(
    isOver && !isDragging && !!isTabDrag && activeDrag.workspaceId !== workspaceId,
    false,
    mergedRef,
    "vertical",
    0.25,
  );

  const isTabDropTarget =
    isOver &&
    !isDragging &&
    activeDrag?.type === "group-tab" &&
    activeDrag.workspaceId !== workspaceId &&
    tabInsertPosition === null;

  const style = {
    marginLeft: depth * 16,
    opacity: isDragging ? 0.4 : undefined,
  };

  const effectiveInsertPosition = insertPosition ?? tabInsertPosition;
  const insertClass =
    effectiveInsertPosition === "before"
      ? "sidebar-insert-before"
      : effectiveInsertPosition === "after"
        ? "sidebar-insert-after"
        : "";

  return (
    <div
      ref={setRef}
      style={style}
      data-sortable-id={`ws-${workspaceId}`}
      className={`ws-item no-drag ${isActive ? "ws-item-active" : ""} ${insertClass} ${isTabDropTarget ? "ws-item-tab-drop" : ""}`}
      onClick={() => {
        if (!isEditing) onSelect();
      }}
      onDoubleClick={onStartEditing}
      onContextMenu={onContextMenu}
      {...attributes}
      {...listeners}
    >
      <div className="ws-item-content">
        <div className="ws-item-row">
          {isEditing ? (
            <InlineRenameInput
              initialValue={name}
              onCommit={(newName) => {
                onRename(newName);
                onStopEditing();
              }}
              onCancel={onStopEditing}
              className="text-[13px]"
            />
          ) : (
            <span className="flex-1 truncate">{name}</span>
          )}
        </div>
        {!isEditing && metadata && <div className="ws-meta">{metadata}</div>}
      </div>
      {shortcutHint && <span className="ws-shortcut-hint">{shortcutHint}</span>}
      {canDelete && !isEditing && !shortcutHint && (
        <button
          type="button"
          className="ws-delete"
          aria-label="Delete workspace"
          title="Delete workspace"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}
