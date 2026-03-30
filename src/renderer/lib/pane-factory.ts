import { nanoid } from "nanoid";
import type { Pane, PaneType, PaneConfig, PaneGroup, Workspace } from "../types/workspace";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const titleForType: Record<PaneType, string> = {
  terminal: "Terminal",
  browser: "Browser",
  editor: "Editor",
  t3code: "T3 Code",
};

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

export function createPane(type: PaneType, configOverride?: Partial<PaneConfig>): Pane {
  // Type assertion needed: we construct from dynamic PaneType values, but the
  // result is always a valid Pane discriminated union member at runtime.
  return {
    id: nanoid(),
    type,
    title: titleForType[type] ?? "Terminal",
    config: configOverride ?? {},
  } as Pane;
}

export function createPaneGroup(pane: Pane): PaneGroup {
  const tabId = nanoid();
  return {
    id: nanoid(),
    tabs: [{ id: tabId, paneId: pane.id }],
    activeTabId: tabId,
  };
}

export function nextWorkspaceName(workspaces: Workspace[]): string {
  const existingNumbers = new Set(
    workspaces
      .map((w) => {
        const match = w.name.match(/^Workspace (\d+)$/);
        return match ? parseInt(match[1]!, 10) : null;
      })
      .filter((n): n is number => n !== null),
  );
  let n = 1;
  while (existingNumbers.has(n)) n++;
  return `Workspace ${n}`;
}

export function createDefaultWorkspace(name: string, group: PaneGroup): Workspace {
  return {
    id: nanoid(),
    name,
    root: { type: "leaf", groupId: group.id },
    focusedGroupId: group.id,
    zoomedGroupId: null,
    lastActiveAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// CWD inheritance
// ---------------------------------------------------------------------------

/**
 * Find the CWD of the nearest terminal in a group or workspace.
 * Lookup order:
 *  1. Active tab in the specified group (if it's a terminal)
 *  2. Any terminal tab in the specified group
 *  3. Focused group's active terminal in the workspace (cross-group fallback)
 *  4. lastTerminalCwd (global fallback from last active terminal)
 *  5. undefined (no terminal context → defaults to $HOME)
 */
export function findNearestTerminalCwd(
  panes: Record<string, Pane>,
  paneGroups: Record<string, PaneGroup>,
  groupId: string | undefined,
  workspace: Workspace | undefined,
  lastTerminalCwd?: string,
): string | undefined {
  // Helper to extract CWD from a pane
  const getCwd = (paneId: string): string | undefined => {
    const pane = panes[paneId];
    if (pane?.type !== "terminal") return undefined;
    return pane.config.cwd || undefined;
  };

  // 1. Active tab in the specified group
  if (groupId) {
    const group = paneGroups[groupId];
    if (group) {
      const activeTab = group.tabs.find((t) => t.id === group.activeTabId);
      if (activeTab) {
        const cwd = getCwd(activeTab.paneId);
        if (cwd) return cwd;
      }
      // 2. Any terminal tab in the same group
      for (const tab of group.tabs) {
        const cwd = getCwd(tab.paneId);
        if (cwd) return cwd;
      }
    }
  }

  // 3. Focused group's active terminal (cross-group fallback)
  if (workspace && workspace.focusedGroupId && workspace.focusedGroupId !== groupId) {
    const focusedGroup = paneGroups[workspace.focusedGroupId];
    if (focusedGroup) {
      const activeTab = focusedGroup.tabs.find((t) => t.id === focusedGroup.activeTabId);
      if (activeTab) {
        const cwd = getCwd(activeTab.paneId);
        if (cwd) return cwd;
      }
    }
  }

  // 4. Global fallback: last known terminal CWD
  if (lastTerminalCwd) return lastTerminalCwd;

  return undefined;
}
