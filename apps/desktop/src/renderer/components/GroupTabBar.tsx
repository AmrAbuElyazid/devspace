import { useState, useEffect, useRef, useCallback, memo } from "react";
import { Plus, Columns2, Rows2, X, Menu } from "lucide-react";
import { SortableContext, useSortable, horizontalListSortingStrategy } from "@dnd-kit/sortable";

import { useWorkspaceStore } from "@/store/workspace-store";
import { collectGroupIds } from "@/lib/split-tree";
import { useActiveDrag, useDropIntent } from "@/hooks/useDndOrchestrator";
import { useSettingsStore } from "@/store/settings-store";
import { useModifierHeldContext } from "@/App";
import { resolveDisplayString } from "../../shared/shortcuts";
import { paneTypeIcons } from "@/lib/pane-type-meta";
import { releaseNativeFocus } from "@/lib/native-pane-focus";
import { cn } from "@/lib/utils";
import type { PaneGroup } from "@/types/workspace";
import type { DragItemData } from "@/types/dnd";

import { Kbd } from "@/components/ui/kbd";
import { HintTooltip } from "@/components/ui/hint-tooltip";

export function handleTabBarWindowZoomDoubleClick(
  event: Pick<React.MouseEvent, "detail" | "stopPropagation">,
  deps: { maximize: () => void } = { maximize: () => window.api.window.maximize() },
): void {
  if (event.detail !== 2) return;
  event.stopPropagation();
  deps.maximize();
}

interface GroupTabBarProps {
  group: PaneGroup;
  groupId: string;
  workspaceId: string;
  isFocused: boolean;
  isTopLeftGroup?: boolean;
  dndEnabled: boolean;
}

const SortableGroupTab = memo(function SortableGroupTab({
  tabId,
  paneId,
  groupId,
  workspaceId,
  isActive,
  isFocused,
  dndEnabled,
  shortcutHint,
  showInsertBefore,
  showInsertAfter,
  onSelect,
  onClose,
}: {
  tabId: string;
  paneId: string;
  groupId: string;
  workspaceId: string;
  isActive: boolean;
  isFocused: boolean;
  dndEnabled: boolean;
  shortcutHint: string | null;
  showInsertBefore: boolean;
  showInsertAfter: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  const pane = useWorkspaceStore((s) => s.panes[paneId]);
  const updatePaneTitle = useWorkspaceStore((s) => s.updatePaneTitle);
  const pendingEditId = useWorkspaceStore((s) => s.pendingEditId);
  const pendingEditType = useWorkspaceStore((s) => s.pendingEditType);
  const clearPendingEdit = useWorkspaceStore((s) => s.clearPendingEdit);
  const activeDrag = useActiveDrag();
  const { attributes, listeners, setNodeRef, isDragging, isOver } = useSortable({
    id: `gtab-${tabId}`,
    disabled: !dndEnabled,
    data: { type: "group-tab", workspaceId, groupId, tabId } satisfies DragItemData,
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (pendingEditType === "tab" && pendingEditId === tabId && isActive) {
      setIsEditing(true);
      setEditValue(pane?.title ?? "");
      clearPendingEdit();
    }
  }, [pendingEditId, pendingEditType, tabId, isActive, pane?.title, clearPendingEdit]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      releaseNativeFocus();
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [isEditing]);

  const commitEdit = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== (pane?.title ?? "")) updatePaneTitle(paneId, trimmed);
    setIsEditing(false);
  }, [editValue, pane?.title, paneId, updatePaneTitle]);

  const cancelEdit = useCallback(() => setIsEditing(false), []);

  const isDropTarget = isOver && !isDragging && activeDrag?.type === "sidebar-workspace";
  const Icon = pane ? paneTypeIcons[pane.type] : paneTypeIcons.terminal;

  return (
    <div
      ref={setNodeRef}
      data-sortable-id={`gtab-${tabId}`}
      data-active={isActive || undefined}
      style={{ opacity: isDragging ? 0.4 : undefined }}
      onClick={onSelect}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
        setEditValue(pane?.title ?? "");
      }}
      onMouseDown={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          onClose();
        }
      }}
      {...attributes}
      {...listeners}
      className={cn(
        "no-drag relative group/tab inline-flex items-center gap-1.5 h-[22px] px-2 max-w-[180px]",
        "rounded-[5px] cursor-default select-none shrink-0",
        "text-[11px] text-muted-foreground transition-[background-color,color] duration-100",
        "hover:bg-hover hover:text-foreground",
        isActive && "bg-foreground/[0.07] text-foreground hover:bg-foreground/[0.07]",
        isFocused && isActive && "bg-foreground/10 hover:bg-foreground/10",
        isDropTarget && "bg-brand-soft outline outline-1 outline-brand-edge",
        showInsertBefore && "insert-before-x",
        showInsertAfter && "insert-after-x",
      )}
    >
      <Icon
        width={10}
        height={10}
        className={cn("shrink-0", isActive ? "text-brand" : "text-muted-foreground/70")}
      />
      {isEditing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitEdit();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              cancelEdit();
            }
            e.stopPropagation();
          }}
          onBlur={commitEdit}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[11px] text-foreground p-0"
        />
      ) : (
        <span className="truncate">{pane?.title ?? "Empty"}</span>
      )}
      {shortcutHint ? (
        <Kbd className="animate-hint shrink-0 h-3.5 min-w-3.5 px-1 text-[9px] font-mono">
          {shortcutHint}
        </Kbd>
      ) : (
        <button
          type="button"
          aria-label="Close tab"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className={cn(
            "no-drag shrink-0 inline-flex items-center justify-center size-3.5 rounded-sm",
            "text-muted-foreground/50 opacity-0 group-hover/tab:opacity-100",
            "hover:text-foreground hover:bg-hover transition-[opacity,color]",
          )}
        >
          <X size={9} strokeWidth={2.4} />
        </button>
      )}
    </div>
  );
});

export default memo(function GroupTabBar({
  group,
  groupId,
  workspaceId,
  isFocused,
  isTopLeftGroup,
  dndEnabled,
}: GroupTabBarProps) {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const addGroupTab = useWorkspaceStore((s) => s.addGroupTab);
  const removeGroupTab = useWorkspaceStore((s) => s.removeGroupTab);
  const setActiveGroupTab = useWorkspaceStore((s) => s.setActiveGroupTab);
  const closeGroup = useWorkspaceStore((s) => s.closeGroup);
  const addWorkspace = useWorkspaceStore((s) => s.addWorkspace);
  const toggleSidebar = useSettingsStore((s) => s.toggleSidebar);
  const defaultPaneType = useSettingsStore((s) => s.defaultPaneType);
  const hasMultipleGroups = useWorkspaceStore((s) => {
    const root = s.workspaces.find((w) => w.id === workspaceId)?.root;
    return root ? collectGroupIds(root).length > 1 : false;
  });

  const modifierHeld = useModifierHeldContext();
  const dropIntent = useDropIntent();

  useEffect(() => {
    if (!isTopLeftGroup) return;
    let cancelled = false;
    void window.api.window.isFullScreen().then((fullScreen) => {
      if (!cancelled) setIsFullScreen(fullScreen);
    });
    const unsubscribe = window.api.window.onFullScreenChange(setIsFullScreen);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [isTopLeftGroup]);

  return (
    <div
      data-focused={isFocused || undefined}
      className={cn(
        "group/tabbar relative flex items-center gap-px shrink-0",
        "h-[30px] px-1 pt-[2px]",
        "bg-rail border-b border-hairline",
        "overflow-x-auto scrollbar-none select-none",
        "data-[focused=true]:bg-[color-mix(in_srgb,var(--foreground)_4%,var(--rail))]",
      )}
    >
      {isTopLeftGroup && (
        <>
          <div
            className="drag-region shrink-0 h-full"
            data-fullscreen={isFullScreen ? "true" : undefined}
            style={{ width: isFullScreen ? 0 : 78 }}
          />
          <div className="flex items-center gap-px shrink-0 mr-1.5 pr-1.5 border-r border-hairline">
            <HintTooltip
              content="Open sidebar"
              shortcut={resolveDisplayString("toggle-sidebar")}
              sideOffset={4}
            >
              <button
                type="button"
                onClick={toggleSidebar}
                aria-label="Open sidebar"
                className="no-drag inline-flex items-center justify-center size-5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-hover transition-colors"
              >
                <Menu size={12} />
              </button>
            </HintTooltip>
            <HintTooltip
              content="New workspace"
              shortcut={resolveDisplayString("new-workspace")}
              sideOffset={4}
            >
              <button
                type="button"
                onClick={() => {
                  if (defaultPaneType === "picker") {
                    useSettingsStore
                      .getState()
                      .openPanePicker({ action: "new-workspace", container: "main" });
                  } else {
                    addWorkspace(undefined, null, "main", defaultPaneType);
                  }
                }}
                aria-label="New workspace"
                className="no-drag inline-flex items-center justify-center size-5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-hover transition-colors"
              >
                <Plus size={12} strokeWidth={2.2} />
              </button>
            </HintTooltip>
          </div>
        </>
      )}

      <SortableContext
        items={group.tabs.map((t) => `gtab-${t.id}`)}
        strategy={horizontalListSortingStrategy}
      >
        {group.tabs.map((tab, tabIndex) => {
          const hintDigit = tabIndex + 1;
          const hint =
            modifierHeld === "control" && isFocused && hintDigit <= 9 ? `⌃${hintDigit}` : null;
          const tabInsertIndex =
            dropIntent?.kind === "reorder-tab" && dropIntent.targetGroupId === groupId
              ? dropIntent.targetIndex
              : null;

          return (
            <SortableGroupTab
              key={tab.id}
              tabId={tab.id}
              paneId={tab.paneId}
              groupId={groupId}
              workspaceId={workspaceId}
              isActive={tab.id === group.activeTabId}
              isFocused={isFocused}
              dndEnabled={dndEnabled}
              shortcutHint={hint}
              showInsertBefore={tabInsertIndex === tabIndex}
              showInsertAfter={
                tabInsertIndex === group.tabs.length && tabIndex === group.tabs.length - 1
              }
              onSelect={() => setActiveGroupTab(workspaceId, groupId, tab.id)}
              onClose={() => removeGroupTab(workspaceId, groupId, tab.id)}
            />
          );
        })}
      </SortableContext>

      <div
        className="drag-region flex-1 self-stretch min-w-2"
        onDoubleClick={(event) => handleTabBarWindowZoomDoubleClick(event)}
        title="Drag window"
      />

      <HintTooltip content="New tab" shortcut={resolveDisplayString("new-tab")} sideOffset={4}>
        <button
          type="button"
          onClick={() => {
            if (defaultPaneType === "picker") {
              useSettingsStore
                .getState()
                .openPanePicker({ action: "new-tab", workspaceId, groupId });
            } else {
              addGroupTab(workspaceId, groupId, defaultPaneType);
            }
          }}
          aria-label="New tab"
          className="no-drag inline-flex items-center justify-center size-5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-hover transition-colors"
        >
          <Plus size={12} strokeWidth={2.2} />
        </button>
      </HintTooltip>

      <div
        className={cn(
          "flex items-center gap-px shrink-0 ml-1 pl-1 border-l border-hairline",
          "opacity-0 group-hover/tabbar:opacity-100 transition-opacity",
          isFocused && "opacity-100",
        )}
      >
        <HintTooltip content="Split right" sideOffset={4}>
          <button
            type="button"
            aria-label="Split right"
            onClick={() =>
              useSettingsStore.getState().openPanePicker({
                action: "split",
                workspaceId,
                groupId,
                splitDirection: "horizontal",
              })
            }
            className="no-drag inline-flex items-center justify-center size-5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-hover transition-colors"
          >
            <Columns2 size={11} />
          </button>
        </HintTooltip>
        <HintTooltip content="Split down" sideOffset={4}>
          <button
            type="button"
            aria-label="Split down"
            onClick={() =>
              useSettingsStore.getState().openPanePicker({
                action: "split",
                workspaceId,
                groupId,
                splitDirection: "vertical",
              })
            }
            className="no-drag inline-flex items-center justify-center size-5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-hover transition-colors"
          >
            <Rows2 size={11} />
          </button>
        </HintTooltip>
        {hasMultipleGroups && (
          <HintTooltip content="Close split" sideOffset={4}>
            <button
              type="button"
              aria-label="Close split"
              onClick={() => closeGroup(workspaceId, groupId)}
              className="no-drag inline-flex items-center justify-center size-5 rounded-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <X size={11} strokeWidth={2.2} />
            </button>
          </HintTooltip>
        )}
      </div>
    </div>
  );
});
