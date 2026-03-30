import type { DragItemData, SidebarContainer } from "../../../types/dnd";
import type { SidebarNode } from "../../../types/workspace";
import { findFolder } from "../../sidebar-tree";
import { resolveSidebarDrop } from "../../sidebar-drop-resolution";
import type { DndHandler, DropIntent, ResolveContext } from "../types";
import type { useWorkspaceStore } from "../../../store/workspace-store";

const SIDEBAR_DRAG_TYPES = new Set(["sidebar-workspace", "sidebar-folder"]);
const SIDEBAR_DROP_TYPES = new Set(["sidebar-workspace", "sidebar-folder", "sidebar-root"]);

function makeSiblings(nodes: SidebarNode[], parentFolderId: string | null): string[] {
  const siblings =
    parentFolderId === null ? nodes : (findFolder(nodes, parentFolderId)?.children ?? []);
  return siblings.map((child) => (child.type === "workspace" ? child.workspaceId : child.id));
}

export const sidebarReorderHandler: DndHandler = {
  id: "sidebar-reorder",

  canHandle(drag: DragItemData): boolean {
    return SIDEBAR_DRAG_TYPES.has(drag.type);
  },

  isValidTarget(_drag: DragItemData, targetData: Record<string, unknown>): boolean {
    return SIDEBAR_DROP_TYPES.has(targetData.type as string);
  },

  resolveIntent(ctx: ResolveContext): DropIntent | null {
    const { drag, collisions, pointer, store } = ctx;

    // Find the first visible sidebar collision target
    const overCollision = collisions.find((c) => {
      const data = c.data?.droppableContainer?.data?.current as Record<string, unknown> | undefined;
      return data && SIDEBAR_DROP_TYPES.has(data.type as string);
    });
    if (!overCollision) return null;

    const overData = overCollision.data?.droppableContainer?.data?.current as Record<
      string,
      unknown
    >;
    const overRect = overCollision.data?.droppableContainer?.rect?.current;
    if (!overData || !overRect) return null;

    const dropType = overData.type as string;
    const state = store.getState();
    const mainNodes = state.sidebarTree as SidebarNode[];
    const pinnedNodes = (state.pinnedSidebarNodes ?? []) as SidebarNode[];
    const targetContainer =
      (overData.container as SidebarContainer | undefined) ??
      ((drag as Extract<DragItemData, { container: SidebarContainer }>)
        .container as SidebarContainer);
    const targetNodes = targetContainer === "main" ? mainNodes : pinnedNodes;

    const rects =
      dropType === "sidebar-folder"
        ? { [`folder-${overData.folderId as string}`]: overRect }
        : dropType === "sidebar-workspace"
          ? { [`ws-${overData.workspaceId as string}`]: overRect }
          : undefined;

    const parentFolderIdForSiblings =
      dropType === "sidebar-root" ? null : ((overData.parentFolderId as string | null) ?? null);

    const resolution = resolveSidebarDrop({
      active: drag as Extract<DragItemData, { type: "sidebar-workspace" | "sidebar-folder" }>,
      over:
        dropType === "sidebar-root"
          ? { type: "sidebar-root", container: targetContainer }
          : dropType === "sidebar-folder"
            ? {
                type: "sidebar-folder",
                folderId: overData.folderId as string,
                container: targetContainer,
                parentFolderId: (overData.parentFolderId as string | null) ?? null,
              }
            : {
                type: "sidebar-workspace",
                workspaceId: overData.workspaceId as string,
                container: targetContainer,
                parentFolderId: (overData.parentFolderId as string | null) ?? null,
              },
      pointer,
      ...(rects ? { rects } : {}),
      siblingIds: {
        main: makeSiblings(mainNodes, parentFolderIdForSiblings),
        pinned: makeSiblings(pinnedNodes, parentFolderIdForSiblings),
      },
      ...(dropType === "sidebar-folder"
        ? {
            folderChildCounts: {
              [overData.folderId as string]:
                findFolder(targetNodes, overData.folderId as string)?.children.length ?? 0,
            },
          }
        : {}),
      rootCounts: {
        main: mainNodes.length,
        pinned: pinnedNodes.length,
      },
    });

    if (!resolution) return null;

    const nodeId =
      drag.type === "sidebar-workspace"
        ? drag.workspaceId
        : (drag as Extract<DragItemData, { type: "sidebar-folder" }>).folderId;
    const nodeType = drag.type === "sidebar-workspace" ? "workspace" : "folder";
    const sourceContainer = (drag as Extract<DragItemData, { container: SidebarContainer }>)
      .container;

    return {
      kind: "reorder-sidebar",
      nodeId,
      nodeType,
      sourceContainer,
      targetContainer: resolution.targetContainer,
      targetParentId: resolution.targetParentId,
      targetIndex: resolution.targetIndex,
    };
  },

  execute(intent: DropIntent, store: typeof useWorkspaceStore): boolean {
    if (intent.kind !== "reorder-sidebar") return false;

    const state = store.getState();
    state.moveSidebarNode({
      nodeId: intent.nodeId,
      nodeType: intent.nodeType,
      sourceContainer: intent.sourceContainer,
      targetContainer: intent.targetContainer,
      targetParentId: intent.targetParentId,
      targetIndex: intent.targetIndex,
    });

    // Expand folder when dropping into it
    if (intent.targetParentId !== null) {
      state.expandFolder(intent.targetParentId);
    }
    return true;
  },
};
