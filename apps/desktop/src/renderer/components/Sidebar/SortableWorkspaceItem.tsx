import { useRef, useCallback } from "react";
import { useSortable } from "@dnd-kit/sortable";

import { useWorkspaceStore } from "@/store/workspace-store";
import { useDevServerStore } from "@/store/dev-server-store";
import { useSettingsStore } from "@/store/settings-store";
import { resolveWorkspaceColor, workspaceColorVar } from "@/lib/workspace-color";
import { useActiveDrag } from "@/hooks/useDndOrchestrator";
import { useInsertionIndicator } from "@/hooks/useInsertionIndicator";
import type { HeldModifier } from "@/hooks/useModifierHeld";
import type { SidebarContainer } from "@/types/dnd";
import { cn } from "@/lib/utils";

import { InlineRenameInput } from "@/components/ui/inline-rename-input";
import { Kbd } from "@/components/ui/kbd";
import { WorkspaceRow } from "./WorkspaceRow";

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
}: SortableWorkspaceItemProps) {
  const name = useWorkspaceStore((s) => s.workspaces.find((w) => w.id === workspaceId)?.name ?? "");
  const storedColor = useWorkspaceStore(
    (s) => s.workspaces.find((w) => w.id === workspaceId)?.color,
  );
  const color = workspaceColorVar(resolveWorkspaceColor(workspaceId, storedColor));
  const info = useWorkspaceStore((s) => s.workspaceSidebarMetadataByWorkspaceId[workspaceId]);
  const ports = useDevServerStore((s) => s.portsByWorkspaceId[workspaceId]);
  const density = useSettingsStore((s) => s.sidebarDensity);
  const isCompact = density === "compact";
  const paneCount = info?.paneCount ?? 0;
  const directory = info?.directory ?? null;

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
    <WorkspaceRow
      ref={setRef}
      name={name}
      color={color}
      directory={directory}
      ports={ports}
      paneCount={paneCount}
      isActive={isActive}
      isSelected={isSelected}
      isCompact={isCompact}
      depth={depth}
      style={{ opacity: isDragging ? 0.4 : undefined }}
      data-sortable-id={`ws-${workspaceId}`}
      onClick={(e) => {
        if (!isEditing) onSelect(e);
      }}
      onDoubleClick={onStartEditing}
      onContextMenu={onContextMenu}
      {...attributes}
      {...listeners}
      className={cn(isTabDropTarget && "drop-into-folder", insertClass)}
      nameSlot={
        isEditing ? (
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
        ) : undefined
      }
      countSlot={
        shortcutHint ? (
          <Kbd
            className={cn(
              // A translucent foreground fill rather than a solid one, so the
              // cap sits correctly on both a plain row and the active row.
              "animate-hint h-4 min-w-4 rounded-sm bg-foreground/10 px-1 font-mono text-ui-micro",
              isActive ? "text-brand" : "text-muted-foreground",
            )}
          >
            {shortcutHint}
          </Kbd>
        ) : undefined
      }
    />
  );
}
