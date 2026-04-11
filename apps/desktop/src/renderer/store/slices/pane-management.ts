import type { Pane } from "../../types/workspace";
import { createPane } from "../../lib/pane-factory";
import type { PaneCleanup } from "../store-helpers";
import { attachPaneOwnersByPaneId } from "../pane-ownership";
import type { WorkspaceState, StoreGet, StoreSet } from "../workspace-state";

type PaneSlice = Pick<
  WorkspaceState,
  "addPane" | "removePane" | "updatePaneConfig" | "updateBrowserPaneZoom" | "updatePaneTitle"
>;

export function createPaneManagementSlice(
  set: StoreSet,
  get: StoreGet,
  cleanupPanes: PaneCleanup,
): PaneSlice {
  return {
    addPane(type, config) {
      const pane = createPane(type, config);
      set((state) => ({ panes: { ...state.panes, [pane.id]: pane } }));
      return pane.id;
    },

    removePane(paneId) {
      cleanupPanes(get().panes, [paneId]);
      set((state) => {
        const newPanes = { ...state.panes };
        delete newPanes[paneId];
        const nextPaneOwnersByPaneId = { ...state.paneOwnersByPaneId };
        delete nextPaneOwnersByPaneId[paneId];
        return { panes: newPanes, paneOwnersByPaneId: nextPaneOwnersByPaneId };
      });
    },

    updatePaneConfig(paneId, updates) {
      set((state) => {
        const pane = state.panes[paneId];
        if (!pane) return state;

        const nextConfig = { ...pane.config, ...updates };
        const keys = Object.keys(updates) as Array<keyof typeof nextConfig>;
        const hasChange = keys.some((key) => pane.config[key] !== nextConfig[key]);
        if (!hasChange) return state;

        const patch: Partial<WorkspaceState> = {
          panes: {
            ...state.panes,
            [paneId]: { ...pane, config: nextConfig } as Pane,
          },
        };

        // Track last terminal CWD on the owning workspace for inheritance fallback
        if (pane.type === "terminal" && "cwd" in updates && typeof updates.cwd === "string") {
          const owner = state.paneOwnersByPaneId[paneId];
          if (owner) {
            patch.workspaces = state.workspaces.map((ws) =>
              ws.id === owner.workspaceId ? { ...ws, lastTerminalCwd: updates.cwd as string } : ws,
            );
          }
        }

        return patch.workspaces ? attachPaneOwnersByPaneId(state, patch) : patch;
      });
    },

    updateBrowserPaneZoom(paneId, zoom) {
      set((state) => {
        const pane = state.panes[paneId];
        if (!pane || pane.type !== "browser") return state;
        if (pane.config.zoom === zoom) return state;

        return {
          panes: {
            ...state.panes,
            [paneId]: {
              ...pane,
              config: { ...pane.config, zoom },
            },
          },
        };
      });
    },

    updatePaneTitle(paneId, title) {
      set((state) => {
        const pane = state.panes[paneId];
        if (!pane) return state;
        return {
          panes: { ...state.panes, [paneId]: { ...pane, title } },
        };
      });
    },
  };
}
