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

export const tabSplitHandler: DndHandler = {
  id: "tab-split",

  canHandle(drag) {
    return drag.type === "group-tab";
  },

  isValidTarget(_drag, targetData) {
    return targetData.type === "pane-drop";
  },

  resolveIntent(ctx: ResolveContext): DropIntent | null {
    const { drag, collisions, pointer } = ctx;
    if (drag.type !== "group-tab") return null;

    for (const collision of collisions) {
      const data = collision.data?.droppableContainer?.data?.current as
        | Record<string, unknown>
        | undefined;
      const rect = collision.data?.droppableContainer?.rect?.current as RectLike | undefined;
      if (!data || data.type !== "pane-drop" || data.visible === false || !rect) continue;

      const side = computeClosestSide(pointer.x, pointer.y, rect);

      return {
        kind: "split-group",
        workspaceId: drag.workspaceId,
        sourceGroupId: drag.groupId,
        sourceTabId: drag.tabId,
        targetGroupId: data.groupId as string,
        side,
      };
    }

    return null;
  },

  execute(intent, store) {
    if (intent.kind !== "split-group") return;
    store
      .getState()
      .splitGroupWithTab(
        intent.workspaceId,
        intent.sourceGroupId,
        intent.sourceTabId,
        intent.targetGroupId,
        intent.side,
      );
  },
};
