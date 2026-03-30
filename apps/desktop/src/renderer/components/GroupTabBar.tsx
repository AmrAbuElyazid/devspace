import { useState, useEffect, useRef, useCallback } from "react";
import { Plus, Columns2, Rows2, X, Menu } from "lucide-react";
import { SortableContext, useSortable, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useWorkspaceStore, collectGroupIds } from "../store/workspace-store";
import { useDragContext } from "../hooks/useDndOrchestrator";
import { useSettingsStore } from "../store/settings-store";
import { useModifierHeldContext } from "../App";
import { resolveDisplayString } from "../../shared/shortcuts";
import { paneTypeIcons } from "../lib/pane-type-meta";
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

function SortableGroupTab({
  tabId,
  paneId,
  groupId,
  workspaceId,
  isActive,
  dndEnabled,
  shortcutHint,
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
  onSelect: () => void;
  onClose: () => void;
}) {
  const pane = useWorkspaceStore((s) => s.panes[paneId]);
  const updatePaneTitle = useWorkspaceStore((s) => s.updatePaneTitle);
  const pendingEditId = useWorkspaceStore((s) => s.pendingEditId);
  const pendingEditType = useWorkspaceStore((s) => s.pendingEditType);
  const clearPendingEdit = useWorkspaceStore((s) => s.clearPendingEdit);
  const { activeDrag } = useDragContext();
  const { attributes, listeners, setNodeRef, isDragging, isOver, transform, transition } =
    useSortable({
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
      void window.api?.terminal?.blur?.();
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

  const baseTransition = "background-color 100ms ease, color 100ms ease";
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ? `${transition}, ${baseTransition}` : undefined,
    opacity: isDragging ? 0.4 : undefined,
  };

  const isDropTarget =
    isOver &&
    !isDragging &&
    (activeDrag?.type === "group-tab" || activeDrag?.type === "sidebar-workspace");

  const Icon = pane ? paneTypeIcons[pane.type] : paneTypeIcons.terminal;

  return (
    <div
      ref={setNodeRef}
      data-sortable-id={`gtab-${tabId}`}
      className={`group-tab ${isActive ? "group-tab-active" : ""} ${isDropTarget ? "group-tab-drop-target" : ""}`}
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
      <Icon size={10} className="tab-icon" />
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
}

export default function GroupTabBar({
  group,
  groupId,
  workspaceId,
  isFocused,
  isTopLeftGroup,
  dndEnabled,
}: GroupTabBarProps) {
  const addGroupTab = useWorkspaceStore((s) => s.addGroupTab);
  const removeGroupTab = useWorkspaceStore((s) => s.removeGroupTab);
  const setActiveGroupTab = useWorkspaceStore((s) => s.setActiveGroupTab);
  const closeGroup = useWorkspaceStore((s) => s.closeGroup);
  const addWorkspace = useWorkspaceStore((s) => s.addWorkspace);
  const toggleSidebar = useSettingsStore((s) => s.toggleSidebar);
  const defaultPaneType = useSettingsStore((s) => s.defaultPaneType);
  const wsRoot = useWorkspaceStore((s) => s.workspaces.find((w) => w.id === workspaceId)?.root);

  const modifierHeld = useModifierHeldContext();
  const hasMultipleGroups = wsRoot ? collectGroupIds(wsRoot).length > 1 : false;

  return (
    <div className={`group-tabbar ${isFocused ? "group-focused" : ""}`}>
      {isTopLeftGroup && (
        <>
          <div className="tabbar-traffic-zone drag-region" />
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
}
