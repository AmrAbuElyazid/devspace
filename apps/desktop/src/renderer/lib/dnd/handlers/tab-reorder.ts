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

    for (const collision of ctx.collisions) {
      const data = collision.data?.droppableContainer?.data?.current as
        | Record<string, unknown>
        | undefined;
      if (!data || data.type !== "group-tab" || data.visible === false) continue;

      return {
        kind: "reorder-tab",
        workspaceId: ctx.drag.workspaceId,
        sourceGroupId: ctx.drag.groupId,
        sourceTabId: ctx.drag.tabId,
        targetGroupId: data.groupId as string,
        targetTabId: data.tabId as string,
      };
    }

    return null;
  },

  execute(intent: DropIntent, store: typeof useWorkspaceStore): boolean {
    if (intent.kind !== "reorder-tab") return false;

    const { workspaceId, sourceGroupId, sourceTabId, targetGroupId, targetTabId } = intent;
    const state = store.getState();

    if (sourceGroupId === targetGroupId) {
      // Intra-group reorder
      const group = state.paneGroups[sourceGroupId];
      if (!group) return true;
      const fromIndex = group.tabs.findIndex((t) => t.id === sourceTabId);
      const toIndex = group.tabs.findIndex((t) => t.id === targetTabId);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return true;
      state.reorderGroupTabs(workspaceId, sourceGroupId, fromIndex, toIndex);
    } else {
      // Cross-group move — insert at position of target tab
      const destGroup = state.paneGroups[targetGroupId];
      if (!destGroup) return true;
      const insertIndex = destGroup.tabs.findIndex((t) => t.id === targetTabId);
      state.moveTabToGroup(
        workspaceId,
        sourceGroupId,
        sourceTabId,
        targetGroupId,
        insertIndex !== -1 ? insertIndex : undefined,
      );
    }
    return true;
  },
};
