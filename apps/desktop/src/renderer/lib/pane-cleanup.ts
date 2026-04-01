import type { Pane } from "../types/workspace";
import { markTerminalSurfaceDestroyed } from "./terminal-surface-session";
import { markEditorDestroyed } from "../components/EditorPane";
import { markT3CodeDestroyed } from "../components/T3CodePane";

export type PaneCleanupDeps = {
  destroyTerminal: (surfaceId: string) => void;
  destroyBrowser: (paneId: string) => void;
  destroyEditor: (paneId: string) => void;
  destroyT3Code: (paneId: string) => void;
  clearBrowserRuntime: (paneId: string) => void;
};

export function cleanupPaneResources(
  panes: Record<string, Pane>,
  paneId: string,
  deps: PaneCleanupDeps,
): void {
  const pane = panes[paneId];

  if (pane?.type === "terminal") {
    markTerminalSurfaceDestroyed(paneId);
    deps.destroyTerminal(paneId);
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
