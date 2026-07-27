import type { Pane, SidebarNode } from "../types/workspace";
import type { SidebarContainer } from "../types/dnd";
import { cleanupPaneResources, type PaneCleanupDeps } from "../lib/pane-cleanup";
import { insertSidebarNode } from "../lib/sidebar-tree";
import { markBrowserPaneDestroyed } from "../lib/browser-pane-session";
import { useBrowserStore } from "./browser-store";
import { useTerminalStore } from "./terminal-store";
import type { WorkspaceState } from "./workspace-state";

// ---------------------------------------------------------------------------
// Sidebar node container helpers (shared across slices)
// ---------------------------------------------------------------------------

export function getSidebarNodesForContainer(
  state: Pick<WorkspaceState, "sidebarTree" | "pinnedSidebarNodes">,
  container: SidebarContainer,
): SidebarNode[] {
  return container === "main" ? state.sidebarTree : state.pinnedSidebarNodes;
}

export function insertNodeIntoSidebarContainer(
  state: Pick<WorkspaceState, "sidebarTree" | "pinnedSidebarNodes">,
  container: SidebarContainer,
  node: SidebarNode,
  parentId: string | null,
  index: number,
): Pick<WorkspaceState, "sidebarTree" | "pinnedSidebarNodes"> {
  const targetNodes = getSidebarNodesForContainer(state, container);
  const insertedNodes = insertSidebarNode(targetNodes, node, parentId, index);

  return {
    sidebarTree: container === "main" ? insertedNodes : state.sidebarTree,
    pinnedSidebarNodes: container === "pinned" ? insertedNodes : state.pinnedSidebarNodes,
  };
}

export type PaneCleanup = (panes: Record<string, Pane>, paneIds: Iterable<string>) => void;

const defaultPaneCleanupDeps: PaneCleanupDeps = {
  destroyTerminal: (surfaceId) => {
    void window.api.terminal.destroy(surfaceId);
  },
  destroyBrowser: (paneId) => {
    void window.api.browser.destroy(paneId);
    markBrowserPaneDestroyed(paneId);
  },
  destroyEditor: (paneId) => {
    void window.api.editor.stop(paneId);
  },
  destroyT3Code: (paneId) => {
    void window.api.t3code.stop(paneId);
  },
  clearBrowserRuntime: (paneId) => {
    useBrowserStore.getState().clearRuntimeState(paneId);
  },
  clearTerminalRuntime: (paneId) => {
    useTerminalStore.getState().clearPaneState(paneId);
  },
  killManagedTerminalSession: (sessionId) => {
    void window.api.terminal
      .killManagedSession(sessionId)
      .then((result) => {
        // The pane is already gone from the store, so there is nothing to retry
        // against. A failure here leaves an orphaned session the user can still
        // reap from Settings, so log it rather than swallowing it.
        if ("error" in result) {
          console.error(
            "[Workspace] Failed to kill managed terminal session:",
            sessionId,
            result.error,
          );
        }
      })
      .catch((error: unknown) => {
        console.error("[Workspace] Failed to kill managed terminal session:", sessionId, error);
      });
  },
};

export const defaultPaneCleanup: PaneCleanup = (panes, paneIds) => {
  const seen = new Set<string>();
  for (const paneId of paneIds) {
    if (seen.has(paneId)) continue;
    seen.add(paneId);
    cleanupPaneResources(panes, paneId, defaultPaneCleanupDeps);
  }
};
