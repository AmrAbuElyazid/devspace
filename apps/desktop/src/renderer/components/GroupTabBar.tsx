import { useState, useEffect, useRef, useCallback, memo } from "react";
import { Plus, Columns2, Rows2, X, Menu } from "lucide-react";
import { SortableContext, useSortable, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { useWorkspaceStore } from "../store/workspace-store";
import { collectGroupIds } from "../lib/split-tree";
import { useActiveDrag, useDropIntent } from "../hooks/useDndOrchestrator";
import { useSettingsStore } from "../store/settings-store";
import { useModifierHeldContext } from "../App";
import { resolveDisplayString } from "../../shared/shortcuts";
import { paneTypeIcons } from "../lib/pane-type-meta";
import { releaseNativeFocus } from "../lib/native-pane-focus";
import type { PaneGroup } from "../types/workspace";
import type { DragItemData } from "../types/dnd";

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

  // Pick up pending tab rename from shortcut (Cmd+Shift+T)
  useEffect(() => {
    if (pendingEditType === "tab" && pendingEditId === tabId && isActive) {
      setIsEditing(true);
      setEditValue(pane?.title ?? "");
      clearPendingEdit();
    }
  }, [pendingEditId, pendingEditType, tabId, isActive, pane?.title, clearPendingEdit]);

  // Focus input when editing starts
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
    if (trimmed && trimmed !== (pane?.title ?? "")) {
      updatePaneTitle(paneId, trimmed);
    }
    setIsEditing(false);
  }, [editValue, pane?.title, paneId, updatePaneTitle]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
  }, []);

  const style = {
    opacity: isDragging ? 0.4 : undefined,
  };

  const isDropTarget = isOver && !isDragging && activeDrag?.type === "sidebar-workspace";

  const Icon = pane ? paneTypeIcons[pane.type] : paneTypeIcons.terminal;

  return (
    <div
      ref={setNodeRef}
      data-sortable-id={`gtab-${tabId}`}
      className={`group-tab ${isActive ? "group-tab-active" : ""} ${isDropTarget ? "group-tab-drop-target" : ""} ${showInsertBefore ? "group-tab-insert-before" : ""} ${showInsertAfter ? "group-tab-insert-after" : ""}`}
      style={style}
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
    >
      <Icon size={10} />
      {isEditing ? (
        <input
          ref={inputRef}
          className="tab-rename-input"
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
        />
      ) : (
        <span className="truncate">{pane?.title ?? "Empty"}</span>
      )}
      {shortcutHint ? (
        <span className="tab-shortcut-hint">{shortcutHint}</span>
      ) : (
        <button
          className="tab-close no-drag"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          <X size={9} />
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
  // Return a boolean instead of the root object to avoid re-renders on split
  // resize (which creates a new root just to update sizes).
  const hasMultipleGroups = useWorkspaceStore((s) => {
    const root = s.workspaces.find((w) => w.id === workspaceId)?.root;
    return root ? collectGroupIds(root).length > 1 : false;
  });

  const modifierHeld = useModifierHeldContext();
  const dropIntent = useDropIntent();

  useEffect(() => {
    if (!isTopLeftGroup) {
      return;
    }

    let cancelled = false;

    void window.api.window.isFullScreen().then((fullScreen) => {
      if (!cancelled) {
        setIsFullScreen(fullScreen);
      }
    });

    const unsubscribe = window.api.window.onFullScreenChange((fullScreen) => {
      setIsFullScreen(fullScreen);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [isTopLeftGroup]);

  return (
    <div className="group-tabbar">
      {isTopLeftGroup && (
        <>
          <div
            className="tabbar-traffic-zone drag-region"
            data-fullscreen={isFullScreen ? "true" : undefined}
          />
          <div className="tabbar-inline-controls">
            <button
              className="tabbar-ctl-btn no-drag"
              onClick={toggleSidebar}
              title={`Open sidebar (${resolveDisplayString("toggle-sidebar")})`}
            >
              <Menu size={13} />
            </button>
            <button
              className="tabbar-ctl-btn no-drag"
              onClick={() => {
                if (defaultPaneType === "picker") {
                  useSettingsStore
                    .getState()
                    .openPanePicker({ action: "new-workspace", container: "main" });
                } else {
                  addWorkspace(undefined, null, "main", defaultPaneType);
                }
              }}
              title={`New workspace (${resolveDisplayString("new-workspace")})`}
            >
              <Plus size={13} />
            </button>
          </div>
        </>
      )}
      <SortableContext
        items={group.tabs.map((t) => `gtab-${t.id}`)}
        strategy={horizontalListSortingStrategy}
      >
        {group.tabs.map((tab, tabIndex) => {
          // Show ⌃1-9 hint when Ctrl is held and this group is focused
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
        className="group-tabbar-drag-spacer drag-region"
        onDoubleClick={(event) => handleTabBarWindowZoomDoubleClick(event)}
        title="Drag window"
      />

      <button
        className="group-tabbar-add no-drag"
        onClick={() => {
          if (defaultPaneType === "picker") {
            useSettingsStore.getState().openPanePicker({ action: "new-tab", workspaceId, groupId });
          } else {
            addGroupTab(workspaceId, groupId, defaultPaneType);
          }
        }}
        title="New tab"
      >
        <Plus size={12} />
      </button>

      <div className="group-tabbar-actions">
        <button
          className="group-tabbar-action no-drag"
          onClick={() =>
            useSettingsStore.getState().openPanePicker({
              action: "split",
              workspaceId,
              groupId,
              splitDirection: "horizontal",
            })
          }
          title="Split Right"
        >
          <Columns2 size={12} />
        </button>
        <button
          className="group-tabbar-action no-drag"
          onClick={() =>
            useSettingsStore.getState().openPanePicker({
              action: "split",
              workspaceId,
              groupId,
              splitDirection: "vertical",
            })
          }
          title="Split Down"
        >
          <Rows2 size={12} />
        </button>
        {hasMultipleGroups && (
          <button
            className="group-tabbar-action no-drag"
            onClick={() => closeGroup(workspaceId, groupId)}
            title="Close Split"
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
});
