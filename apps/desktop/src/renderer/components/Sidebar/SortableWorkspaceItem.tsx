import { useRef, useCallback } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { X } from "lucide-react";

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
      onClick={() => {
        if (!isEditing) onSelect();
      }}
      onDoubleClick={onStartEditing}
      onContextMenu={onContextMenu}
      {...attributes}
      {...listeners}
      className={cn(
        "no-drag relative group/ws flex items-center gap-2.5 h-9 px-2.5 rounded-[8px] cursor-default select-none",
        "text-[12.5px] text-foreground/80",
        "transition-[background-color,color,box-shadow] duration-100",
        "hover:bg-white/[0.03] hover:text-foreground",
        // Active state: solid neutral wash + a thin top inset highlight
        // so the row reads as gently raised. No gradient, no glow.
        isActive &&
          cn(
            "text-foreground bg-white/[0.05] hover:bg-white/[0.05]",
            "shadow-[inset_0_1px_0_rgb(255_255_255_/_0.06)]",
          ),
        isTabDropTarget && "drop-into-folder",
        insertClass,
      )}
    >
      {/* Pane icon chip — active state uses solid brand-soft bg + brand
          edge border + thin top inset, no gradient. */}
      <div
        className={cn(
          "shrink-0 inline-flex items-center justify-center size-[24px] rounded-[6px] border",
          "transition-[background-color,color,border-color] duration-100",
          isActive
            ? cn(
                "text-brand bg-brand-soft border-brand-edge",
                "shadow-[inset_0_1px_0_oklch(0.86_0.17_92_/_0.22)]",
              )
            : cn(
                "border-white/[0.05] bg-white/[0.04]",
                "text-muted-foreground/85 group-hover/ws:text-foreground",
              ),
        )}
      >
        {PaneIcon ? <PaneIcon width={13} height={13} /> : <span className="size-[13px]" />}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-px">
        {isEditing ? (
          <InlineRenameInput
            initialValue={name}
            onCommit={(newName) => {
              onRename(newName);
              onStopEditing();
            }}
            onCancel={onStopEditing}
            className={cn("text-[12.5px]", isActive ? "font-medium" : "")}
            aria-label="Rename workspace"
          />
        ) : (
          <span
            className={cn(
              "truncate leading-tight tracking-[-0.005em]",
              isActive ? "text-foreground font-[550]" : "",
            )}
          >
            {name}
          </span>
        )}
        {!isEditing && metadata ? (
          <span className="truncate leading-none text-[10px] font-mono text-muted-foreground/50">
            {metadata}
          </span>
        ) : null}
      </div>

      {shortcutHint ? (
        <Kbd
          className={cn(
            "animate-hint shrink-0 h-[18px] min-w-[18px] px-1.5 text-[10px] font-mono border",
            isActive
              ? "text-brand bg-brand-soft border-brand-edge/60"
              : "text-muted-foreground/65 bg-black/30 border-white/[0.04]",
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
            "shrink-0 inline-flex items-center justify-center size-5 rounded-[5px]",
            "text-muted-foreground/55 opacity-0 group-hover/ws:opacity-100",
            "hover:text-destructive hover:bg-destructive/10",
            "transition-[opacity,color,background-color]",
          )}
        >
          <X size={11} strokeWidth={2.4} />
        </button>
      ) : null}
    </div>
  );
}
