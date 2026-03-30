import type { DropSide } from "../types/dnd";
import type { RectLike } from "../types/geometry";

interface ActiveTabDrag {
  workspaceId: string;
  groupId: string;
  tabId: string;
}

interface BaseTarget {
  visible: boolean;
  rect: RectLike;
}

interface GroupTabTarget extends BaseTarget {
  kind: "group-tab";
  workspaceId: string;
  groupId: string;
  tabId: string;
}

interface PaneDropTarget extends BaseTarget {
  kind: "pane-drop";
  workspaceId: string;
  groupId: string;
}

interface SidebarWorkspaceTarget extends BaseTarget {
  kind: "sidebar-workspace";
  workspaceId: string;
}

interface SidebarFolderTarget extends BaseTarget {
  kind: "sidebar-folder";
  folderId: string;
}

export type TabDropTarget =
  | GroupTabTarget
  | PaneDropTarget
  | SidebarWorkspaceTarget
  | SidebarFolderTarget;

export type TabDropIntent =
  | {
      kind: "move-to-group-tab";
      workspaceId: string;
      sourceGroupId: string;
      sourceTabId: string;
      targetGroupId: string;
      targetTabId: string;
    }
  | {
      kind: "split-group";
      workspaceId: string;
      sourceGroupId: string;
      sourceTabId: string;
      targetGroupId: string;
      side: DropSide;
    }
  | {
      kind: "move-to-workspace";
      sourceWorkspaceId: string;
      sourceGroupId: string;
      sourceTabId: string;
      targetWorkspaceId: string;
    };

interface ResolveTabDropIntentInput {
  active: ActiveTabDrag;
  pointer: { x: number; y: number };
  overTargets: TabDropTarget[];
}

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

export function resolveTabDropIntent({
  active,
  pointer,
  overTargets,
}: ResolveTabDropIntentInput): TabDropIntent | null {
  const visibleTargets = overTargets.filter((target) => target.visible);

  for (const target of visibleTargets) {
    if (target.kind === "group-tab") {
      return {
        kind: "move-to-group-tab",
        workspaceId: active.workspaceId,
        sourceGroupId: active.groupId,
        sourceTabId: active.tabId,
        targetGroupId: target.groupId,
        targetTabId: target.tabId,
      };
    }
  }

  for (const target of visibleTargets) {
    if (target.kind === "pane-drop") {
      return {
        kind: "split-group",
        workspaceId: active.workspaceId,
        sourceGroupId: active.groupId,
        sourceTabId: active.tabId,
        targetGroupId: target.groupId,
        side: computeClosestSide(pointer.x, pointer.y, target.rect),
      };
    }
  }

  for (const target of visibleTargets) {
    if (target.kind === "sidebar-workspace" && target.workspaceId !== active.workspaceId) {
      return {
        kind: "move-to-workspace",
        sourceWorkspaceId: active.workspaceId,
        sourceGroupId: active.groupId,
        sourceTabId: active.tabId,
        targetWorkspaceId: target.workspaceId,
      };
    }
  }

  return null;
}
