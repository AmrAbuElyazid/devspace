import type { DragItemData } from "../../../types/dnd";
import type { useWorkspaceStore } from "../../../store/workspace-store";
import type { DndHandler, DropIntent, ResolveContext } from "../types";

export const tabToWorkspaceHandler: DndHandler = {
  id: "tab-to-workspace",

  canHandle(drag: DragItemData): boolean {
    return drag.type === "group-tab";
  },

  isValidTarget(_drag: DragItemData, targetData: Record<string, unknown>): boolean {
    return targetData.type === "sidebar-workspace";
  },

  resolveIntent(ctx: ResolveContext): DropIntent | null {
    if (ctx.drag.type !== "group-tab") return null;

    for (const collision of ctx.collisions) {
      const data = collision.data?.droppableContainer?.data?.current as
        | Record<string, unknown>
        | undefined;
      const rect = collision.data?.droppableContainer?.rect?.current;
      if (!data || data.type !== "sidebar-workspace" || data.visible === false || !rect) continue;

      // Must be a different workspace than the drag source
      if (data.workspaceId === ctx.drag.workspaceId) continue;

      // Center zone check — only handle the middle 50% of the workspace item.
      // Edge zones (top 25%, bottom 25%) are delegated to handler 6.
      const relY = (ctx.pointer.y - rect.top) / rect.height;
      if (relY < 0.25 || relY > 0.75) continue;

      return {
        kind: "move-to-workspace",
        sourceWorkspaceId: ctx.drag.workspaceId,
        sourceGroupId: ctx.drag.groupId,
        sourceTabId: ctx.drag.tabId,
        targetWorkspaceId: data.workspaceId as string,
      };
    }

    return null;
  },

  execute(intent: DropIntent, store: typeof useWorkspaceStore): boolean {
    if (intent.kind !== "move-to-workspace") return false;

    store
      .getState()
      .moveTabToWorkspace(
        intent.sourceWorkspaceId,
        intent.sourceGroupId,
        intent.sourceTabId,
        intent.targetWorkspaceId,
      );
    return true;
  },
};
