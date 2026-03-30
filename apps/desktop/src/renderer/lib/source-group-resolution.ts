import { nanoid } from "nanoid";
import type { Workspace, Pane, PaneGroup, PaneGroupTab, SplitNode } from "../types/workspace";
import {
  collectGroupIds,
  removeGroupFromTree,
  simplifyTree,
  findSiblingGroupId,
  findFirstGroupId,
} from "./split-tree";
import { createPane } from "./pane-factory";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/**
 * Result of resolving a source group after a tab has been removed from it.
 * This is a pure data structure describing the mutations to apply, with no
 * side effects.
 */
type SourceGroupResolution =
  | {
      /** The source group still has remaining tabs. */
      kind: "tabs-remaining";
      srcGroup: PaneGroup;
    }
  | {
      /** The source group was emptied and removed from the tree. */
      kind: "group-removed";
      newRoot: SplitNode;
      newFocusedGroupId: string | null;
    }
  | {
      /** The source group was emptied but is the only group — replaced with a fallback pane. */
      kind: "group-replaced-with-fallback";
      srcGroup: PaneGroup;
      fallbackPane: Pane;
    };

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

/**
 * After removing `removedTabId` from `srcGroup`, determine what should
 * happen to the source group.
 *
 * This is a pure function — it returns a data descriptor rather than
 * mutating state. The caller applies the result to the store.
 *
 * @param workspace       The workspace containing the source group
 * @param srcGroupId      The source group's ID
 * @param srcGroup        The source group object (before tab removal)
 * @param removedTabId    The ID of the tab that was removed
 * @param focusTransferGroupId  Optional: a preferred groupId to transfer focus to
 *                              (e.g. the destination group in a move operation).
 *                              Falls back to a sibling or first group otherwise.
 */
export function resolveSourceGroupAfterTabRemoval(
  workspace: Workspace,
  srcGroupId: string,
  srcGroup: PaneGroup,
  removedTabId: string,
  focusTransferGroupId?: string,
): SourceGroupResolution {
  const remainingTabs = srcGroup.tabs.filter((t) => t.id !== removedTabId);

  if (remainingTabs.length > 0) {
    // Source group still has tabs — just update activeTabId if needed
    let activeTabId = srcGroup.activeTabId;
    if (srcGroup.activeTabId === removedTabId) {
      const removedIndex = srcGroup.tabs.findIndex((t) => t.id === removedTabId);
      activeTabId =
        remainingTabs[Math.min(removedIndex, remainingTabs.length - 1)]?.id ?? remainingTabs[0]!.id;
    }
    return {
      kind: "tabs-remaining",
      srcGroup: { ...srcGroup, tabs: remainingTabs, activeTabId },
    };
  }

  // Source group is now empty
  const allGroupIds = collectGroupIds(workspace.root);

  if (allGroupIds.length > 1) {
    // Multiple groups exist — remove this group from the tree
    const cleaned = removeGroupFromTree(workspace.root, srcGroupId);
    const newRoot = cleaned ? simplifyTree(cleaned) : workspace.root;

    const newFocusedGroupId =
      workspace.focusedGroupId === srcGroupId
        ? (focusTransferGroupId ??
          findSiblingGroupId(workspace.root, srcGroupId) ??
          findFirstGroupId(newRoot))
        : workspace.focusedGroupId;

    return {
      kind: "group-removed",
      newRoot,
      newFocusedGroupId,
    };
  }

  // Only group — replace with a fresh terminal pane
  const fallbackPane = createPane("terminal");
  const fallbackTab: PaneGroupTab = { id: nanoid(), paneId: fallbackPane.id };
  return {
    kind: "group-replaced-with-fallback",
    srcGroup: { ...srcGroup, tabs: [fallbackTab], activeTabId: fallbackTab.id },
    fallbackPane,
  };
}
