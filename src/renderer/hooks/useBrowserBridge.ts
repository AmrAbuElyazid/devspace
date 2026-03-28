import { useEffect } from "react";
import { useWorkspaceStore, collectGroupIds } from "../store/workspace-store";
import { useBrowserStore } from "../store/browser-store";
import { findWorkspaceIdForPane } from "../lib/browser-pane-routing";
import type { BrowserBridgeListeners, BrowserBridgeUnsubscribe } from "../../shared/types";

function subscribeToBrowserEvents(listeners: BrowserBridgeListeners): BrowserBridgeUnsubscribe {
  const disposers: BrowserBridgeUnsubscribe[] = [];

  if (listeners.onStateChange) {
    disposers.push(window.api.browser.onStateChange(listeners.onStateChange));
  }

  if (listeners.onPermissionRequest) {
    disposers.push(window.api.browser.onPermissionRequest(listeners.onPermissionRequest));
  }

  if (listeners.onOpenInNewTabRequest) {
    disposers.push(window.api.browser.onOpenInNewTabRequest(listeners.onOpenInNewTabRequest));
  }

  return () => {
    for (const dispose of disposers) {
      dispose();
    }
  };
}

/**
 * Bridges browser IPC events (state changes, permission requests, open-in-new-tab)
 * to the browser and workspace stores.
 */
export function useBrowserBridge(): void {
  const handleRuntimeStateChange = useBrowserStore((s) => s.handleRuntimeStateChange);
  const setPendingPermissionRequest = useBrowserStore((s) => s.setPendingPermissionRequest);
  const clearPendingPermissionRequest = useBrowserStore((s) => s.clearPendingPermissionRequest);
  const updatePaneConfig = useWorkspaceStore((s) => s.updatePaneConfig);
  const updateBrowserPaneZoom = useWorkspaceStore((s) => s.updateBrowserPaneZoom);
  const openBrowserInGroup = useWorkspaceStore((s) => s.openBrowserInGroup);

  useEffect(() => {
    return subscribeToBrowserEvents({
      onStateChange: (state) => {
        handleRuntimeStateChange(state, {
          persistUrlChange: (paneId, url) => {
            updatePaneConfig(paneId, { url });
          },
          persistCommittedNavigation: state.isLoading === false,
          persistZoomChange: (paneId, zoom) => {
            updateBrowserPaneZoom(paneId, zoom);
          },
        });
      },
      onPermissionRequest: (request) => {
        const replacedRequestToken = setPendingPermissionRequest(request);
        if (replacedRequestToken) {
          void window.api.browser.resolvePermission(replacedRequestToken, "deny");
        }
      },
      onOpenInNewTabRequest: (request) => {
        const state = useWorkspaceStore.getState();
        const workspaceId = findWorkspaceIdForPane(
          state.workspaces,
          request.paneId,
          state.paneGroups,
        );
        if (workspaceId) {
          const ws = state.workspaces.find((w) => w.id === workspaceId);
          const groupId = ws?.focusedGroupId ?? (ws ? collectGroupIds(ws.root)[0] : null);
          if (groupId) {
            openBrowserInGroup(workspaceId, groupId, request.url);
          }
        }
      },
    });
  }, [
    clearPendingPermissionRequest,
    handleRuntimeStateChange,
    openBrowserInGroup,
    setPendingPermissionRequest,
    updateBrowserPaneZoom,
    updatePaneConfig,
  ]);
}
