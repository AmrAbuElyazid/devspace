import type { PaneGroupTab } from "../types/workspace";

export interface RecentTabTraversalState {
  order: string[];
  index: number;
  updatedAt: number;
}

export function buildRecentTabOrder(
  currentOrder: string[] | undefined,
  tabs: PaneGroupTab[],
  activeTabId: string,
): string[] {
  const tabIds = tabs.map((tab) => tab.id);
  if (!tabIds.includes(activeTabId)) {
    return tabIds;
  }

  const normalizedCurrent = (currentOrder ?? []).filter(
    (tabId) => tabId !== activeTabId && tabIds.includes(tabId),
  );
  const unseenTabIds = tabIds.filter(
    (tabId) => tabId !== activeTabId && !normalizedCurrent.includes(tabId),
  );

  return [activeTabId, ...normalizedCurrent, ...unseenTabIds];
}

export function removeTabFromRecentOrder(order: string[] | undefined, tabId: string): string[] {
  return (order ?? []).filter((entry) => entry !== tabId);
}

export function clearRecentTabTraversal(
  traversalByGroupId: Record<string, RecentTabTraversalState>,
  groupId: string,
): Record<string, RecentTabTraversalState> {
  if (!(groupId in traversalByGroupId)) {
    return traversalByGroupId;
  }

  const next = { ...traversalByGroupId };
  delete next[groupId];
  return next;
}

export function clearAllRecentTabTraversals(
  traversalByGroupId: Record<string, RecentTabTraversalState>,
): Record<string, RecentTabTraversalState> {
  if (Object.keys(traversalByGroupId).length === 0) {
    return traversalByGroupId;
  }

  return {};
}

export function removeGroupRecentState<T>(
  stateByGroupId: Record<string, T>,
  groupId: string,
): Record<string, T> {
  if (!(groupId in stateByGroupId)) {
    return stateByGroupId;
  }

  const next = { ...stateByGroupId };
  delete next[groupId];
  return next;
}
