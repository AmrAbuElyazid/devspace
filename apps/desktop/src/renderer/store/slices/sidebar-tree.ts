import { nanoid } from "nanoid";
import type { SidebarNode } from "../../types/workspace";
import {
  findSidebarNode,
  findFolder,
  removeSidebarNode,
  insertSidebarNode,
  isDescendant,
  updateFolderInTree,
  removeFolderPromoteChildren,
} from "../../lib/sidebar-tree";
import { getSidebarNodesForContainer } from "../store-helpers";
import type { WorkspaceState, StoreGet, StoreSet } from "../workspace-state";

type SidebarTreeSlice = Pick<
  WorkspaceState,
  | "moveSidebarNode"
  | "reorderSidebarNode"
  | "addFolder"
  | "removeFolder"
  | "renameFolder"
  | "toggleFolderCollapsed"
  | "expandFolder"
  | "togglePinWorkspace"
  | "pinWorkspace"
  | "unpinWorkspace"
  | "pinFolder"
  | "unpinFolder"
>;

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

function findOwnerFolder(nodes: SidebarNode[], target: SidebarNode[]): string | null {
  for (const n of nodes) {
    if (n.type === "folder") {
      if (n.children === target) return n.id;
      const found = findOwnerFolder(n.children, target);
      if (found) return found;
    }
  }
  return null;
}

function locateSidebarNodeContainer(
  state: Pick<WorkspaceState, "sidebarTree" | "pinnedSidebarNodes">,
  nodeId: string,
  nodeType: "workspace" | "folder",
): "main" | "pinned" | null {
  if (findSidebarNode(state.sidebarTree, nodeId, nodeType)) return "main";
  if (findSidebarNode(state.pinnedSidebarNodes, nodeId, nodeType)) return "pinned";
  return null;
}

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

export function createSidebarTreeSlice(set: StoreSet, get: StoreGet): SidebarTreeSlice {
  return {
    moveSidebarNode: ({
      nodeId,
      nodeType,
      sourceContainer,
      targetContainer,
      targetParentId,
      targetIndex,
    }) => {
      set((state) => {
        const sourceNodes = getSidebarNodesForContainer(state, sourceContainer);
        const targetNodes = getSidebarNodesForContainer(state, targetContainer);
        const sameContainer = sourceContainer === targetContainer;

        const sourceParentId = (() => {
          const result = findSidebarNode(sourceNodes, nodeId, nodeType);
          if (!result) return null;
          // result.parent is the array containing the node. If it's the root array,
          // there's no parent folder. Otherwise find the folder whose children === result.parent.
          if (result.parent === sourceNodes) return null;
          return findOwnerFolder(sourceNodes, result.parent);
        })();

        const sourceSiblingNodes =
          sourceParentId === null
            ? sourceNodes
            : (findFolder(sourceNodes, sourceParentId)?.children ?? []);

        const sourceIndex = sourceSiblingNodes.findIndex((child) => {
          if (nodeType === "workspace") {
            return child.type === "workspace" && child.workspaceId === nodeId;
          }
          return child.type === "folder" && child.id === nodeId;
        });

        if (nodeType === "folder" && targetParentId !== null) {
          if (nodeId === targetParentId) return state;
          if (sameContainer && isDescendant(sourceNodes, nodeId, targetParentId)) return state;
        }

        const [sourceAfterRemove, removed] = removeSidebarNode(sourceNodes, nodeId, nodeType);
        if (!removed) return state;

        const insertionBase = sourceContainer === targetContainer ? sourceAfterRemove : targetNodes;
        const adjustedTargetIndex =
          sameContainer &&
          sourceParentId === targetParentId &&
          sourceIndex !== -1 &&
          sourceIndex < targetIndex
            ? targetIndex - 1
            : targetIndex;
        const targetAfterInsert = insertSidebarNode(
          insertionBase,
          removed,
          targetParentId,
          adjustedTargetIndex,
        );

        return {
          sidebarTree:
            targetContainer === "main"
              ? targetAfterInsert
              : sourceContainer === "main"
                ? sourceAfterRemove
                : state.sidebarTree,
          pinnedSidebarNodes:
            targetContainer === "pinned"
              ? targetAfterInsert
              : sourceContainer === "pinned"
                ? sourceAfterRemove
                : state.pinnedSidebarNodes,
        };
      });
    },

    reorderSidebarNode: (nodeId, nodeType, targetParentId, targetIndex) => {
      const container = locateSidebarNodeContainer(get(), nodeId, nodeType) ?? "main";
      get().moveSidebarNode({
        nodeId,
        nodeType,
        sourceContainer: container,
        targetContainer: container,
        targetParentId,
        targetIndex,
      });
    },

    addFolder: (name, parentId = null, container = "main") => {
      const id = nanoid();
      const folderNode: SidebarNode = {
        type: "folder",
        id,
        name,
        collapsed: false,
        children: [],
      };
      set((state) => {
        const targetNodes = getSidebarNodesForContainer(state, container);
        const insertedNodes = insertSidebarNode(targetNodes, folderNode, parentId, 0);

        return {
          sidebarTree: container === "main" ? insertedNodes : state.sidebarTree,
          pinnedSidebarNodes: container === "pinned" ? insertedNodes : state.pinnedSidebarNodes,
          pendingEditId: id,
          pendingEditType: "folder" as const,
        };
      });
      return id;
    },

    removeFolder: (folderId) => {
      set((state) => ({
        sidebarTree: removeFolderPromoteChildren(state.sidebarTree, folderId),
        pinnedSidebarNodes: removeFolderPromoteChildren(state.pinnedSidebarNodes, folderId),
      }));
    },

    renameFolder: (folderId, name) => {
      set((state) => ({
        sidebarTree: updateFolderInTree(state.sidebarTree, folderId, { name }),
        pinnedSidebarNodes: updateFolderInTree(state.pinnedSidebarNodes, folderId, { name }),
      }));
    },

    toggleFolderCollapsed: (folderId) => {
      set((state) => {
        const folder =
          findFolder(state.sidebarTree, folderId) ?? findFolder(state.pinnedSidebarNodes, folderId);
        if (!folder) return state;
        return {
          sidebarTree: updateFolderInTree(state.sidebarTree, folderId, {
            collapsed: !folder.collapsed,
          }),
          pinnedSidebarNodes: updateFolderInTree(state.pinnedSidebarNodes, folderId, {
            collapsed: !folder.collapsed,
          }),
        };
      });
    },

    expandFolder: (folderId) => {
      set((state) => ({
        sidebarTree: updateFolderInTree(state.sidebarTree, folderId, { collapsed: false }),
        pinnedSidebarNodes: updateFolderInTree(state.pinnedSidebarNodes, folderId, {
          collapsed: false,
        }),
      }));
    },

    togglePinWorkspace(id) {
      const state = get();
      const container = locateSidebarNodeContainer(state, id, "workspace");
      if (container === "pinned") {
        state.unpinWorkspace(id);
      } else if (container === "main") {
        state.pinWorkspace(id);
      }
    },

    pinWorkspace(id) {
      const state = get();
      if (locateSidebarNodeContainer(state, id, "workspace") !== "main") return;
      state.moveSidebarNode({
        nodeId: id,
        nodeType: "workspace",
        sourceContainer: "main",
        targetContainer: "pinned",
        targetParentId: null,
        targetIndex: state.pinnedSidebarNodes.length,
      });
    },

    unpinWorkspace(id) {
      const state = get();
      if (locateSidebarNodeContainer(state, id, "workspace") !== "pinned") return;
      state.moveSidebarNode({
        nodeId: id,
        nodeType: "workspace",
        sourceContainer: "pinned",
        targetContainer: "main",
        targetParentId: null,
        targetIndex: state.sidebarTree.length,
      });
    },

    pinFolder(folderId) {
      const state = get();
      if (locateSidebarNodeContainer(state, folderId, "folder") !== "main") return;
      state.moveSidebarNode({
        nodeId: folderId,
        nodeType: "folder",
        sourceContainer: "main",
        targetContainer: "pinned",
        targetParentId: null,
        targetIndex: state.pinnedSidebarNodes.length,
      });
    },

    unpinFolder(folderId) {
      const state = get();
      if (locateSidebarNodeContainer(state, folderId, "folder") !== "pinned") return;
      state.moveSidebarNode({
        nodeId: folderId,
        nodeType: "folder",
        sourceContainer: "pinned",
        targetContainer: "main",
        targetParentId: null,
        targetIndex: state.sidebarTree.length,
      });
    },
  };
}
