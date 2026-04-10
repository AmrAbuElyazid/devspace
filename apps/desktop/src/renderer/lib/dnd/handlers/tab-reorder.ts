import type { DragItemData } from "../../../types/dnd";
import type { useWorkspaceStore } from "../../../store/workspace-store";
import type { DndHandler, DropIntent, ResolveContext } from "../types";

export const tabReorderHandler: DndHandler = {
  id: "tab-reorder",

  canHandle(drag: DragItemData): boolean {
    return drag.type === "group-tab";
  },

  isValidTarget(_drag: DragItemData, targetData: Record<string, unknown>): boolean {
    return targetData.type === "group-tab";
  },

  resolveIntent(ctx: ResolveContext): DropIntent | null {
    if (ctx.drag.type !== "group-tab") return null;

    const state = ctx.store.getState();

    for (const collision of ctx.collisions) {
      const data = collision.data?.droppableContainer?.data?.current as
        | Record<string, unknown>
        | undefined;
      const rect = collision.data?.droppableContainer?.rect?.current;
      if (!data || data.type !== "group-tab" || data.visible === false || !rect) continue;

      const targetGroupId = data.groupId as string;
      const targetTabId = data.tabId as string;
      const targetGroup = state.paneGroups[targetGroupId];
      const targetIndex = targetGroup?.tabs.findIndex((tab) => tab.id === targetTabId) ?? -1;
      if (targetIndex === -1) continue;

      const insertAfter = (ctx.pointer.x - rect.left) / rect.width > 0.5;

      return {
        kind: "reorder-tab",
        workspaceId: ctx.drag.workspaceId,
        sourceGroupId: ctx.drag.groupId,
        sourceTabId: ctx.drag.tabId,
        targetGroupId,
        targetIndex: targetIndex + (insertAfter ? 1 : 0),
      };
    }

    return null;
  },

  execute(intent: DropIntent, store: typeof useWorkspaceStore): boolean {
    if (intent.kind !== "reorder-tab") return false;

    const { workspaceId, sourceGroupId, sourceTabId, targetGroupId, targetIndex } = intent;
    const state = store.getState();

    if (sourceGroupId === targetGroupId) {
      // Intra-group reorder
      const group = state.paneGroups[sourceGroupId];
      if (!group) return true;
      const fromIndex = group.tabs.findIndex((t) => t.id === sourceTabId);
      if (fromIndex === -1) return true;

      const adjustedTargetIndex = fromIndex < targetIndex ? targetIndex - 1 : targetIndex;
      if (adjustedTargetIndex < 0 || adjustedTargetIndex >= group.tabs.length) return true;
      if (fromIndex === adjustedTargetIndex) return true;

      state.reorderGroupTabs(workspaceId, sourceGroupId, fromIndex, adjustedTargetIndex);
    } else {
      // Cross-group move — insert at the resolved insertion index in the target group
      const destGroup = state.paneGroups[targetGroupId];
      if (!destGroup) return true;
      state.moveTabToGroup(
        workspaceId,
        sourceGroupId,
        sourceTabId,
        targetGroupId,
        Math.min(targetIndex, destGroup.tabs.length),
      );
    }
    return true;
  },
};
