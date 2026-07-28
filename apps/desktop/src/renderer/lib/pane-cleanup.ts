import type { Pane } from "../types/workspace";
import { destroyTrackedTerminalSurfaces } from "./terminal-surface-session";
import { markEditorDestroyed } from "../components/EditorPane";
import { markT3CodeDestroyed } from "../components/T3CodePane";

export type PaneCleanupDeps = {
  destroyTerminal: (surfaceId: string) => void;
  destroyBrowser: (paneId: string) => void;
  destroyEditor: (paneId: string) => void;
  destroyT3Code: (paneId: string) => void;
  clearBrowserRuntime: (paneId: string) => void;
  clearTerminalRuntime?: (paneId: string) => void;
  killManagedTerminalSession?: (sessionId: string) => void;
};

/**
 * Release everything a pane owns, for panes the user has explicitly closed.
 *
 * Only the store's removal paths call this — removing a pane, closing a tab,
 * closing a split group, deleting a workspace. Eviction of an inactive pane
 * destroys its surface directly and never comes through here, which is what
 * keeps a background dev server alive when its workspace is switched away
 * from. Anything torn down here is torn down for good.
 */
export function cleanupPaneResources(
  panes: Record<string, Pane>,
  paneId: string,
  deps: PaneCleanupDeps,
): void {
  const pane = panes[paneId];

  if (pane?.type === "terminal") {
    destroyTrackedTerminalSurfaces([paneId], deps.destroyTerminal);
    deps.clearTerminalRuntime?.(paneId);

    // Destroying a managed-tmux surface only detaches, so the session and every
    // process under it outlive the pane unless it is killed here. External tmux
    // sessions are the user's, not ours, so they are left running.
    if (pane.config.backend === "managed-tmux") {
      deps.killManagedTerminalSession?.(pane.config.sessionId);
    }
  }

  if (pane?.type === "browser") {
    deps.destroyBrowser(paneId);
    deps.clearBrowserRuntime(paneId);
  }

  if (pane?.type === "editor") {
    markEditorDestroyed(paneId);
    deps.destroyEditor(paneId);
  }

  if (pane?.type === "t3code") {
    markT3CodeDestroyed(paneId);
    deps.destroyT3Code(paneId);
  }
}
