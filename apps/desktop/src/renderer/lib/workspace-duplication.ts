import { nanoid } from "nanoid";

import type { Pane, PaneGroup, SplitNode, Workspace } from "../types/workspace";

interface WorkspaceClone {
  workspace: Workspace;
  /** Newly minted panes, keyed by id — merge into `state.panes`. */
  panes: Record<string, Pane>;
  /** Newly minted groups, keyed by id — merge into `state.paneGroups`. */
  paneGroups: Record<string, PaneGroup>;
}

interface CloneSource {
  workspaces: Workspace[];
  panes: Record<string, Pane>;
  paneGroups: Record<string, PaneGroup>;
}

/**
 * Copies a pane's config for a duplicate.
 *
 * Anything naming a live resource has to be re-minted rather than shared: two
 * panes pointing at one managed tmux session would fight over the same PTY,
 * and two note panes on one note id would be a surprise shared document. What
 * carries over is the *intent* — the directory, the URL, the folder — so the
 * copy opens where the original is, with its own processes.
 */
function clonePaneConfig(pane: Pane): Pane["config"] {
  switch (pane.type) {
    case "terminal":
      return pane.config.backend === "managed-tmux"
        ? { ...pane.config, sessionId: nanoid() }
        : { ...pane.config };
    case "note":
      return { noteId: nanoid() };
    default:
      return { ...pane.config };
  }
}

/** Copies a pane, re-minting anything that names a live resource. */
export function clonePane(pane: Pane): Pane {
  return {
    id: nanoid(),
    type: pane.type,
    title: pane.title,
    config: clonePaneConfig(pane),
  } as Pane;
}

/**
 * Builds a copy of a workspace: same split layout, same tabs in the same
 * order, every pane and group re-identified. Returns null when the source
 * workspace is missing.
 */
export function cloneWorkspace(
  state: CloneSource,
  workspaceId: string,
  name: string,
): WorkspaceClone | null {
  const source = state.workspaces.find((workspace) => workspace.id === workspaceId);
  if (!source) return null;

  const panes: Record<string, Pane> = {};
  const paneGroups: Record<string, PaneGroup> = {};
  const groupIdBySourceId = new Map<string, string>();

  const cloneGroup = (sourceGroupId: string): string | null => {
    const sourceGroup = state.paneGroups[sourceGroupId];
    if (!sourceGroup) return null;

    const tabs = sourceGroup.tabs.flatMap((tab) => {
      const sourcePane = state.panes[tab.paneId];
      if (!sourcePane) return [];
      const pane = clonePane(sourcePane);
      panes[pane.id] = pane;
      return [{ id: nanoid(), paneId: pane.id, sourceTabId: tab.id }];
    });
    if (tabs.length === 0) return null;

    const activeTab = tabs.find((tab) => tab.sourceTabId === sourceGroup.activeTabId) ?? tabs[0]!;
    const group: PaneGroup = {
      id: nanoid(),
      tabs: tabs.map(({ id, paneId }) => ({ id, paneId })),
      activeTabId: activeTab.id,
    };
    paneGroups[group.id] = group;
    groupIdBySourceId.set(sourceGroupId, group.id);
    return group.id;
  };

  // Rebuild the split tree bottom-up, dropping any branch whose groups all
  // failed to clone so the copy can never reference a missing group.
  const cloneNode = (node: SplitNode): SplitNode | null => {
    if (node.type === "leaf") {
      const groupId = cloneGroup(node.groupId);
      return groupId ? { type: "leaf", groupId } : null;
    }
    const children: SplitNode[] = [];
    const sizes: number[] = [];
    node.children.forEach((child, index) => {
      const cloned = cloneNode(child);
      if (!cloned) return;
      children.push(cloned);
      sizes.push(node.sizes[index] ?? 1);
    });
    if (children.length === 0) return null;
    if (children.length === 1) return children[0]!;
    return { type: "branch", direction: node.direction, children, sizes };
  };

  const root = cloneNode(source.root);
  if (!root) return null;

  const focusedGroupId = source.focusedGroupId
    ? (groupIdBySourceId.get(source.focusedGroupId) ?? null)
    : null;

  return {
    workspace: {
      id: nanoid(),
      name,
      root,
      focusedGroupId,
      zoomedGroupId: source.zoomedGroupId
        ? (groupIdBySourceId.get(source.zoomedGroupId) ?? null)
        : null,
      lastActiveAt: Date.now(),
      ...(source.lastTerminalCwd ? { lastTerminalCwd: source.lastTerminalCwd } : {}),
    },
    panes,
    paneGroups,
  };
}

/**
 * "Notes" → "Notes copy" → "Notes copy 2". Mirrors how Finder disambiguates
 * so the name stays readable after repeated duplication.
 */
export function nextDuplicateName(existing: Workspace[], sourceName: string): string {
  const taken = new Set(existing.map((workspace) => workspace.name));
  const base = sourceName.replace(/ copy(?: \d+)?$/, "");
  const candidate = `${base} copy`;
  if (!taken.has(candidate)) return candidate;
  let n = 2;
  while (taken.has(`${candidate} ${n}`)) n++;
  return `${candidate} ${n}`;
}
