import { useEffect } from "react";

import { titleBarHeightFor } from "../../shared/chrome";
import type { SidebarPeekConfig } from "../../shared/sidebar-peek";
import { buildSidebarPeekRows } from "../lib/sidebar-peek-snapshot";
import { useDevServerStore } from "../store/dev-server-store";
import { useSettingsStore } from "../store/settings-store";
import { useWorkspaceStore } from "../store/workspace-store";

function currentConfig(): SidebarPeekConfig {
  const settings = useSettingsStore.getState();
  const workspace = useWorkspaceStore.getState();

  return {
    enabled: !settings.sidebarOpen && !settings.settingsOpen,
    titleBarHeight: titleBarHeightFor(settings.sidebarOpen),
    snapshot: {
      dark: document.documentElement.classList.contains("dark"),
      compact: settings.sidebarDensity === "compact",
      rows: buildSidebarPeekRows({
        pinnedSidebarNodes: workspace.pinnedSidebarNodes,
        sidebarTree: workspace.sidebarTree,
        workspaces: workspace.workspaces,
        activeWorkspaceId: workspace.activeWorkspaceId,
        metadataByWorkspaceId: workspace.workspaceSidebarMetadataByWorkspaceId,
        portsByWorkspaceId: useDevServerStore.getState().portsByWorkspaceId,
      }),
    },
  };
}

/**
 * Keeps the main process supplied with the collapsed sidebar's hover panel.
 *
 * The split is deliberate: this side knows *what* the panel says, the main
 * process knows *when* to show it. Only the main process can see the cursor
 * reach the window's left edge, because a collapsed sidebar leaves the renderer
 * barely any window it still receives mouse events in — the native panes take
 * the rest.
 *
 * Mount once, at the app root.
 */
export function useSidebarPeek(): void {
  useEffect(() => {
    let last = "";
    const push = (): void => {
      const config = currentConfig();
      // The stores fire for reasons the panel does not care about, and this
      // runs on every one of them. Serialising is cheaper than an IPC send
      // plus a re-render in the other renderer.
      const serialized = JSON.stringify(config);
      if (serialized === last) return;
      last = serialized;
      window.api.sidebarPeek.setConfig(config);
    };

    push();
    const unsubscribes = [
      useSettingsStore.subscribe(push),
      useWorkspaceStore.subscribe(push),
      useDevServerStore.subscribe(push),
    ];
    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, []);

  useEffect(() => {
    return window.api.sidebarPeek.onActivate((workspaceId) => {
      const state = useWorkspaceStore.getState();
      if (!state.workspaces.some((workspace) => workspace.id === workspaceId)) return;
      state.setActiveWorkspace(workspaceId);
    });
  }, []);
}
