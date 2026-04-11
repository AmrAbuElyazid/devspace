import { useRef, useCallback } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { X } from "lucide-react";
import { useWorkspaceStore } from "../../store/workspace-store";
import { useActiveDrag } from "../../hooks/useDndOrchestrator";
import { useInsertionIndicator } from "../../hooks/useInsertionIndicator";
import { InlineRenameInput } from "../ui/InlineRenameInput";
import { getWorkspaceMetadata } from "./sidebar-utils";
import type { HeldModifier } from "../../hooks/useModifierHeld";
import type { SidebarContainer } from "../../types/dnd";

interface SortableWorkspaceItemProps {
  workspaceId: string;
  container: SidebarContainer;
  parentFolderId: string | null;
  depth: number;
  isActive: boolean;
  isEditing: boolean;
  modifierHeld: HeldModifier;
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
  modifierHeld,
  onSelect,
  onStartEditing,
  onRename,
  onStopEditing,
  onContextMenu,
  onDelete,
}: SortableWorkspaceItemProps) {
  // Each workspace item reads its own data from the store so that
  // title/CWD/pane changes in OTHER workspaces don't cascade here.
  const name = useWorkspaceStore((s) => s.workspaces.find((w) => w.id === workspaceId)?.name ?? "");
  const metadata = useWorkspaceStore((s) => {
    const ws = s.workspaces.find((w) => w.id === workspaceId);
    if (!ws) return "";
    return getWorkspaceMetadata(ws, s.panes, s.paneGroups);
  });
  const canDelete = useWorkspaceStore((s) => s.workspaces.length > 1);

  // Compute shortcut hint from workspace index
  const shortcutHint = useWorkspaceStore((s) => {
    if (modifierHeld !== "command") return null;
    const idx = s.workspaces.findIndex((w) => w.id === workspaceId);
    if (idx < 0) return null;
    if (idx < 8) return `⌘${idx + 1}`;
    if (idx === s.workspaces.length - 1) return "⌘9";
    return null;
  });
  const activeDrag = useActiveDrag();
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
