import { useRef, useCallback } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { Check, X } from "lucide-react";

import { useWorkspaceStore } from "@/store/workspace-store";
import { useActiveDrag } from "@/hooks/useDndOrchestrator";
import { useInsertionIndicator } from "@/hooks/useInsertionIndicator";
import { paneTypeIcons } from "@/lib/pane-type-meta";
import type { HeldModifier } from "@/hooks/useModifierHeld";
import type { SidebarContainer } from "@/types/dnd";
import { cn } from "@/lib/utils";

import { InlineRenameInput } from "@/components/ui/inline-rename-input";
import { Kbd } from "@/components/ui/kbd";

interface SortableWorkspaceItemProps {
  workspaceId: string;
  container: SidebarContainer;
  parentFolderId: string | null;
  depth: number;
  isActive: boolean;
  isSelected: boolean;
  isEditing: boolean;
  modifierHeld: HeldModifier;
  onSelect: (event: React.MouseEvent) => void;
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
  isSelected,
  isEditing,
  modifierHeld,
  onSelect,
  onStartEditing,
  onRename,
  onStopEditing,
  onContextMenu,
  onDelete,
}: SortableWorkspaceItemProps) {
  const name = useWorkspaceStore((s) => s.workspaces.find((w) => w.id === workspaceId)?.name ?? "");
  const metadata = useWorkspaceStore(
    (s) => s.workspaceSidebarMetadataByWorkspaceId[workspaceId] ?? "",
  );
  const canDelete = useWorkspaceStore((s) => s.workspaces.length > 1);

  const focusedPaneType = useWorkspaceStore((s) => {
    const ws = s.workspaces.find((w) => w.id === workspaceId);
    if (!ws?.focusedGroupId) return null;
    const group = s.paneGroups[ws.focusedGroupId];
    if (!group?.activeTabId) return null;
    const tab = group.tabs.find((t) => t.id === group.activeTabId);
    if (!tab) return null;
    const pane = s.panes[tab.paneId];
    return pane?.type ?? null;
  });

  const PaneIcon = focusedPaneType ? (paneTypeIcons[focusedPaneType] ?? null) : null;

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

  const isSidebarDrag =
    activeDrag?.type === "sidebar-workspace" || activeDrag?.type === "sidebar-folder";
  const insertPosition = useInsertionIndicator(
    isOver && !isDragging && isSidebarDrag,
    false,
    mergedRef,
    "vertical",
  );

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

  const effectiveInsert = insertPosition ?? tabInsertPosition;
  const insertClass =
    effectiveInsert === "before"
      ? "insert-before"
      : effectiveInsert === "after"
        ? "insert-after"
        : "";

  return (
    <div
      ref={setRef}
      style={{
        marginLeft: depth * 14,
        opacity: isDragging ? 0.4 : undefined,
      }}
      data-sortable-id={`ws-${workspaceId}`}
      data-active={isActive || undefined}
      data-selected={isSelected || undefined}
      onClick={(e) => {
        if (!isEditing) onSelect(e);
      }}
      onDoubleClick={onStartEditing}
      onContextMenu={onContextMenu}
      {...attributes}
      {...listeners}
      className={cn(
        "chrome-row chrome-focus no-drag group/ws gap-2.5 h-9 px-2.5 cursor-default select-none",
        "text-ui-sm",
        isTabDropTarget && "drop-into-folder",
        insertClass,
      )}
    >
      {/* Pane icon, or a check once the row joins a multi-selection. The slot
          keeps its size either way so rows never reflow. It used to be a
          bordered chip, which read as a button you could press — the icon now
          carries the row's state by colour alone. */}
      <span
        className={cn(
          "shrink-0 inline-flex items-center justify-center size-3.5",
          "transition-colors duration-100",
          isSelected || isActive
            ? "text-brand"
            : "text-muted-foreground group-hover/ws:text-foreground",
        )}
      >
        {isSelected ? (
          <Check size={14} strokeWidth={2.4} />
        ) : PaneIcon ? (
          <PaneIcon width={14} height={14} />
        ) : null}
      </span>

      <div className="flex-1 min-w-0 flex flex-col gap-px">
        {isEditing ? (
          <InlineRenameInput
            initialValue={name}
            onCommit={(newName) => {
              onRename(newName);
              onStopEditing();
            }}
            onCancel={onStopEditing}
            className={cn("text-ui-sm", isActive && "font-medium")}
            aria-label="Rename workspace"
          />
        ) : (
          <span className={cn("truncate leading-tight", isActive && "font-medium")}>{name}</span>
        )}
        {!isEditing && metadata ? (
          <span className="truncate leading-none text-ui-micro font-mono text-muted-foreground">
            {metadata}
          </span>
        ) : null}
      </div>

      {shortcutHint ? (
        <Kbd
          className={cn(
            "animate-hint shrink-0 h-auto bg-transparent px-0 text-ui-micro font-mono",
            isActive ? "text-brand" : "text-muted-foreground",
          )}
        >
          {shortcutHint}
        </Kbd>
      ) : canDelete && !isEditing ? (
        <button
          type="button"
          aria-label="Delete workspace"
          title="Delete workspace"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className={cn(
            "chrome-focus shrink-0 inline-flex items-center justify-center size-5 rounded-md",
            "text-muted-foreground opacity-0 group-hover/ws:opacity-100 focus-visible:opacity-100",
            "hover:text-destructive hover:bg-destructive/10",
            "transition-[opacity,color,background-color]",
          )}
        >
          <X size={12} strokeWidth={2.2} />
        </button>
      ) : null}
    </div>
  );
}
