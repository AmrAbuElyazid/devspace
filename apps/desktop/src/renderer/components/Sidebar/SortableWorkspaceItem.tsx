import { useRef, useCallback } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { Check } from "lucide-react";

import { useWorkspaceStore } from "@/store/workspace-store";
import { useSettingsStore } from "@/store/settings-store";
import { formatSidebarDirectory } from "@/lib/sidebar-directory";
import { resolveWorkspaceColor, workspaceColorVar } from "@/lib/workspace-color";
import { useActiveDrag } from "@/hooks/useDndOrchestrator";
import { useInsertionIndicator } from "@/hooks/useInsertionIndicator";
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
    <div
      ref={setRef}
      style={{
        marginLeft: depth * 13,
        opacity: isDragging ? 0.4 : undefined,
        // Tinted with the workspace's own hue rather than one shared amber, so
        // the active row reads as "this workspace" and not just "selected".
        ...(isActive && !isSelected
          ? { backgroundColor: `color-mix(in oklch, ${color} 16%, transparent)` }
          : {}),
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
        "group/ws relative flex items-center gap-2 rounded-md pr-2 pl-2.5",
        "chrome-focus no-drag cursor-default select-none transition-colors duration-100",
        isCompact ? "min-h-[26px]" : "min-h-9 py-1",
        "hover:bg-row-hover",
        isSelected && "bg-row-selected ring-1 ring-inset ring-brand-edge",
        isTabDropTarget && "drop-into-folder",
        insertClass,
      )}
    >
      {/* Identity stripe. Two pixels of the workspace's own colour, hard against
          the leading edge, so a row is recognisable before its name is read.
          Colours land in the next change; until then every row is neutral. */}
      <span
        aria-hidden
        style={{ backgroundColor: color }}
        className={cn(
          "absolute left-0 rounded-full transition-all",
          isActive ? "inset-y-1 w-[2.5px] opacity-100" : "inset-y-[7px] w-0.5 opacity-80",
        )}
      />

      {isSelected ? <Check size={13} strokeWidth={2.4} className="shrink-0 text-brand" /> : null}

      <div className="flex min-w-0 flex-1 flex-col gap-px">
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
          <span
            className={cn(
              "truncate leading-tight text-ui-sm",
              isActive ? "font-medium text-foreground" : "text-foreground/[0.88]",
            )}
          >
            {name}
          </span>
        )}
        {/* Truncated from the left, because the tail of a path is what tells
            two sibling worktrees apart. */}
        {!isEditing && !isCompact && directory ? (
          <span
            title={directory}
            // rtl puts the ellipsis on the left, so the tail of the path — the
            // part that identifies it — survives. formatSidebarDirectory
            // prefixes an LTR mark to stop the leading "~/" being reordered.
            style={{ direction: "rtl" }}
            className="truncate text-left font-mono text-ui-micro leading-none text-muted-foreground"
          >
            {formatSidebarDirectory(directory)}
          </span>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {shortcutHint ? (
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
        ) : paneCount > 0 ? (
          <span className="min-w-2 text-right font-mono text-ui-micro tabular-nums text-muted-foreground">
            {paneCount}
          </span>
        ) : null}
      </div>
    </div>
  );
}
