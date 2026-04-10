import type { DragItemData, SidebarContainer } from "../../../types/dnd";
import type { SidebarNode } from "../../../types/workspace";
import type { useWorkspaceStore } from "../../../store/workspace-store";
import { findFolder } from "../../sidebar-tree";
import type { DndHandler, DropIntent, ResolveContext } from "../types";

const SIDEBAR_TARGET_TYPES = new Set(["sidebar-root", "sidebar-folder", "sidebar-workspace"]);

function getParentNodes(
  state: { sidebarTree: SidebarNode[]; pinnedSidebarNodes: SidebarNode[] },
  container: SidebarContainer,
  parentFolderId: string | null,
): SidebarNode[] {
  const rootNodes = container === "main" ? state.sidebarTree : state.pinnedSidebarNodes;
  if (parentFolderId === null) return rootNodes;
  return findFolder(rootNodes, parentFolderId)?.children ?? [];
}

export const tabToSidebarHandler: DndHandler = {
  id: "tab-to-sidebar",

  canHandle(drag: DragItemData): boolean {
    return drag.type === "group-tab";
  },

  isValidTarget(_drag: DragItemData, targetData: Record<string, unknown>): boolean {
    return SIDEBAR_TARGET_TYPES.has(targetData.type as string);
  },

  resolveIntent(ctx: ResolveContext): DropIntent | null {
    if (ctx.drag.type !== "group-tab") return null;
    const drag = ctx.drag;

    const sidebarCollisions = ctx.collisions.filter((collision) => {
      const data = collision.data?.droppableContainer?.data?.current as
        | Record<string, unknown>
        | undefined;
      return data && SIDEBAR_TARGET_TYPES.has(data.type as string) && data.visible !== false;
    });

    for (const collision of [
      ...sidebarCollisions.filter((candidate) => {
        const data = candidate.data?.droppableContainer?.data?.current as Record<string, unknown>;
        return data.type !== "sidebar-root";
      }),
      ...sidebarCollisions.filter((candidate) => {
        const data = candidate.data?.droppableContainer?.data?.current as Record<string, unknown>;
        return data.type === "sidebar-root";
      }),
    ]) {
      const data = collision.data?.droppableContainer?.data?.current as
        | Record<string, unknown>
        | undefined;
      const rect = collision.data?.droppableContainer?.rect?.current;
      if (!data) continue;

      if (data.type === "sidebar-root") {
        const container = (data.container as SidebarContainer) ?? "main";
        const state = ctx.store.getState();
        const nodes = container === "main" ? state.sidebarTree : state.pinnedSidebarNodes;
        return {
          kind: "create-workspace-from-tab",
          sourceWorkspaceId: drag.workspaceId,
          sourceGroupId: drag.groupId,
          sourceTabId: drag.tabId,
          targetContainer: container,
          targetParentFolderId: null,
          targetIndex: (nodes as SidebarNode[]).length,
        };
      }

      if (data.type === "sidebar-folder" && rect) {
        const relY = (ctx.pointer.y - rect.top) / rect.height;
        const container = (data.container as SidebarContainer) ?? "main";
        const state = ctx.store.getState();
        const rootNodes = container === "main" ? state.sidebarTree : state.pinnedSidebarNodes;

        if (relY >= 0.25 && relY <= 0.75) {
          // Center zone — drop INTO folder (append to end)
          const folderId = data.folderId as string;
          const folder = findFolder(rootNodes as SidebarNode[], folderId);
          return {
            kind: "create-workspace-from-tab",
            sourceWorkspaceId: drag.workspaceId,
            sourceGroupId: drag.groupId,
            sourceTabId: drag.tabId,
            targetContainer: container,
            targetParentFolderId: folderId,
            targetIndex: folder?.children.length ?? 0,
          };
        }

        // Edge zone — insert before/after the folder at its parent level
        const parentFolderId = (data.parentFolderId as string | null) ?? null;
        const parentNodes = getParentNodes(
          state as { sidebarTree: SidebarNode[]; pinnedSidebarNodes: SidebarNode[] },
          container,
          parentFolderId,
        );
        const folderId = data.folderId as string;
        const overIndex = parentNodes.findIndex((n) => n.type === "folder" && n.id === folderId);
        const insertAfter = relY > 0.75;
        return {
          kind: "create-workspace-from-tab",
          sourceWorkspaceId: drag.workspaceId,
          sourceGroupId: drag.groupId,
          sourceTabId: drag.tabId,
          targetContainer: container,
          targetParentFolderId: parentFolderId,
          targetIndex:
            overIndex === -1 ? parentNodes.length : insertAfter ? overIndex + 1 : overIndex,
        };
      }

      if (data.type === "sidebar-workspace" && rect) {
        const relY = (ctx.pointer.y - rect.top) / rect.height;

        // Center zone — delegate to handler 4 (move-to-workspace)
        if (relY >= 0.25 && relY <= 0.75) return null;

        // Edge zone — create new workspace at this position
        const container = (data.container as SidebarContainer) ?? "main";
        const parentFolderId = (data.parentFolderId as string | null) ?? null;
        const state = ctx.store.getState();
        const parentNodes = getParentNodes(
          state as { sidebarTree: SidebarNode[]; pinnedSidebarNodes: SidebarNode[] },
          container,
          parentFolderId,
        );
        const workspaceId = data.workspaceId as string;
        const overIndex = parentNodes.findIndex(
          (n) => n.type === "workspace" && n.workspaceId === workspaceId,
        );
        const insertAfter = relY > 0.75;
        return {
          kind: "create-workspace-from-tab",
          sourceWorkspaceId: drag.workspaceId,
          sourceGroupId: drag.groupId,
          sourceTabId: drag.tabId,
          targetContainer: container,
          targetParentFolderId: parentFolderId,
          targetIndex:
            overIndex === -1 ? parentNodes.length : insertAfter ? overIndex + 1 : overIndex,
        };
      }
    }

    return null;
  },

  execute(intent: DropIntent, store: typeof useWorkspaceStore): boolean {
    if (intent.kind !== "create-workspace-from-tab") return false;

    store
      .getState()
      .createWorkspaceFromTab(intent.sourceTabId, intent.sourceGroupId, intent.sourceWorkspaceId, {
        parentFolderId: intent.targetParentFolderId,
        container: intent.targetContainer,
        insertIndex: intent.targetIndex,
      });
    return true;
  },
};
