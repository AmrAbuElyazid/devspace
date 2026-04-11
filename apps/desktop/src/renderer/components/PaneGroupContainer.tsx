import { memo, useCallback, useEffect, type ReactElement } from "react";
import { useWorkspaceStore, getTopLeftGroupId } from "../store/workspace-store";
import { useNativeViewStore } from "../store/native-view-store";
import { useActiveDrag, useDropIntent } from "../hooks/useDndOrchestrator";
import GroupTabBar from "./GroupTabBar";
import PaneGroupContent from "./PaneGroupContent";

interface PaneGroupContainerProps {
  groupId: string;
  workspaceId: string;
  sidebarOpen: boolean;
  dndEnabled: boolean;
}

export default memo(function PaneGroupContainer({
  groupId,
  workspaceId,
  sidebarOpen,
  dndEnabled,
}: PaneGroupContainerProps): ReactElement | null {
  const group = useWorkspaceStore((s) => s.paneGroups[groupId]);
  const topLeftGroupId = useWorkspaceStore((s) => {
    const ws = s.workspaces.find((w) => w.id === workspaceId);
    return ws ? getTopLeftGroupId(ws.root) : null;
  });
  const isTopLeftGroup = !sidebarOpen && groupId === topLeftGroupId;
  const focusedGroupId = useWorkspaceStore((s) => {
    const ws = s.workspaces.find((w) => w.id === workspaceId);
    return ws?.focusedGroupId ?? null;
  });
  const setFocusedGroup = useWorkspaceStore((s) => s.setFocusedGroup);

  const activeDrag = useActiveDrag();
  const dropIntent = useDropIntent();
  const isFocused = focusedGroupId === groupId;
  const dragHidesViews = useNativeViewStore((s) => s.dragHidesViews);
  const hasDragOverlay =
    activeDrag?.type === "group-tab" || activeDrag?.type === "sidebar-workspace";
  const previewSide =
    dropIntent?.kind === "split-group" && dropIntent.targetGroupId === groupId
      ? dropIntent.side
      : dropIntent?.kind === "split-with-workspace" && dropIntent.targetGroupId === groupId
        ? dropIntent.side
        : null;

  const handleFocus = useCallback(() => {
    setFocusedGroup(workspaceId, groupId);
  }, [setFocusedGroup, workspaceId, groupId]);

  // Auto-repair: if group not found, create one
  useEffect(() => {
    if (!group) {
      console.warn(`[PaneGroupContainer] Group "${groupId}" not found — this shouldn't happen`);
    }
  }, [group, groupId]);

  if (!group) return null;

  const activeTab = group.tabs.find((tab) => tab.id === group.activeTabId) ?? null;

  return (
    <div
      className={`pane-group${isFocused ? " pane-group-focused" : ""}`}
      onMouseDown={handleFocus}
    >
      <GroupTabBar
        group={group}
        groupId={groupId}
        workspaceId={workspaceId}
        isFocused={isFocused}
        isTopLeftGroup={isTopLeftGroup}
        dndEnabled={dndEnabled}
      />
      <PaneGroupContent
        activeTab={activeTab}
        dragHidesViews={dragHidesViews}
        dndEnabled={dndEnabled}
        groupId={groupId}
        hasDragOverlay={hasDragOverlay}
        isFocused={isFocused}
        previewSide={previewSide}
        workspaceId={workspaceId}
      />
    </div>
  );
});
