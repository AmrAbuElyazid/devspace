import type { Pane } from "../../types/workspace";
import { collectGroupIds } from "../../lib/split-tree";
import { createPane } from "../../lib/pane-factory";
import { cleanupPaneResources, defaultPaneCleanupDeps } from "../store-helpers";
import type { WorkspaceState, StoreGet, StoreSet } from "../workspace-state";

type PaneSlice = Pick<
  WorkspaceState,
  "addPane" | "removePane" | "updatePaneConfig" | "updateBrowserPaneZoom" | "updatePaneTitle"
>;

export function createPaneManagementSlice(set: StoreSet, get: StoreGet): PaneSlice {
  return {
    addPane(type, config) {
      const pane = createPane(type, config);
      set((state) => ({ panes: { ...state.panes, [pane.id]: pane } }));
      return pane.id;
    },

    removePane(paneId) {
      // Side effects (IPC calls) must happen before set() — read panes for cleanup only
      cleanupPaneResources(get().panes, paneId, defaultPaneCleanupDeps);
      set((state) => {
        const newPanes = { ...state.panes };
        delete newPanes[paneId];
        return { panes: newPanes };
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
          const ownerWs = state.workspaces.find((ws) => {
            const groupIds = collectGroupIds(ws.root);
            return groupIds.some((gid) => {
              const group = state.paneGroups[gid];
              return group?.tabs.some((tab) => tab.paneId === paneId);
            });
          });
          if (ownerWs) {
            patch.workspaces = state.workspaces.map((ws) =>
              ws.id === ownerWs.id ? { ...ws, lastTerminalCwd: updates.cwd as string } : ws,
            );
          }
        }

        return patch;
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
