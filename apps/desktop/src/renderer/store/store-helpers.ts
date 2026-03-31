import type { SidebarNode } from "../types/workspace";
import type { SidebarContainer } from "../types/dnd";
import { cleanupPaneResources, type PaneCleanupDeps } from "../lib/pane-cleanup";
import { markBrowserPaneDestroyed } from "../lib/browser-pane-session";
import { useBrowserStore } from "./browser-store";
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

// ---------------------------------------------------------------------------
// Pane cleanup dependencies (shared across slices)
// ---------------------------------------------------------------------------

export { cleanupPaneResources };

export const defaultPaneCleanupDeps: PaneCleanupDeps = {
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
};
