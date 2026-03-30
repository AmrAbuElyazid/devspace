import type { DragItemData } from "../../../types/dnd";
import type { RectLike } from "../../../types/geometry";
import type { DndHandler, DropIntent, DropSide, ResolveContext } from "../types";

function computeClosestSide(pointerX: number, pointerY: number, rect: RectLike): DropSide {
  const relX = (pointerX - rect.left) / rect.width;
  const relY = (pointerY - rect.top) / rect.height;

  const distLeft = relX;
  const distRight = 1 - relX;
  const distTop = relY;
  const distBottom = 1 - relY;
  const minDist = Math.min(distLeft, distRight, distTop, distBottom);

  if (minDist === distLeft) return "left";
  if (minDist === distRight) return "right";
  if (minDist === distTop) return "top";
  return "bottom";
}

export const workspaceToActiveHandler: DndHandler = {
  id: "workspace-to-active",

  canHandle(drag) {
    return drag.type === "sidebar-workspace";
  },

  isValidTarget(_drag, targetData) {
    return targetData.type === "group-tab" || targetData.type === "pane-drop";
  },

  resolveIntent(ctx: ResolveContext): DropIntent | null {
    if (ctx.drag.type !== "sidebar-workspace") return null;

    // Look for group-tab targets first (merge)
    for (const collision of ctx.collisions) {
      const data = collision.data?.droppableContainer?.data?.current as
        | Record<string, unknown>
        | undefined;
      if (!data || data.visible === false) continue;
      if (data.type === "group-tab") {
        return {
          kind: "merge-workspace" as const,
          sourceWorkspaceId: (ctx.drag as Extract<DragItemData, { type: "sidebar-workspace" }>)
            .workspaceId,
          targetGroupId: data.groupId as string,
        };
      }
    }

    // Then look for pane-drop targets (split)
    for (const collision of ctx.collisions) {
      const data = collision.data?.droppableContainer?.data?.current as
        | Record<string, unknown>
        | undefined;
      const rect = collision.data?.droppableContainer?.rect?.current as RectLike | undefined;
      if (!data || data.type !== "pane-drop" || data.visible === false || !rect) continue;

      const side = computeClosestSide(ctx.pointer.x, ctx.pointer.y, rect);
      return {
        kind: "split-with-workspace" as const,
        sourceWorkspaceId: (ctx.drag as Extract<DragItemData, { type: "sidebar-workspace" }>)
          .workspaceId,
        targetGroupId: data.groupId as string,
        side,
      };
    }

    return null;
  },

  execute(intent, store) {
    if (intent.kind === "merge-workspace") {
      store.getState().mergeWorkspaceIntoGroup(intent.sourceWorkspaceId, intent.targetGroupId);
      return true;
    }
    if (intent.kind === "split-with-workspace") {
      store
        .getState()
        .splitGroupWithWorkspace(intent.sourceWorkspaceId, intent.targetGroupId, intent.side);
      return true;
    }
    return false;
  },
};
