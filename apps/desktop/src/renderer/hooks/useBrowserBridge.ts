import { useEffect } from "react";
import { useWorkspaceStore, collectGroupIds } from "../store/workspace-store";
import { useBrowserStore } from "../store/browser-store";
import {
  buildBrowserContextMenuItems,
  getBrowserContextMenuSearchUrl,
  writeClipboardText,
} from "../lib/browser-context-menu";
import { findWorkspaceIdForPane } from "../lib/browser-pane-routing";
import { extractEditorFolderFromUrl } from "../lib/editor-url";
import { syncWorkspaceFocusForPane } from "../lib/native-pane-focus";
import type { BrowserBridgeListeners, BrowserBridgeUnsubscribe } from "../../shared/types";

function subscribeToBrowserEvents(listeners: BrowserBridgeListeners): BrowserBridgeUnsubscribe {
  const disposers: BrowserBridgeUnsubscribe[] = [];

  if (listeners.onStateChange) {
    disposers.push(window.api.browser.onStateChange(listeners.onStateChange));
  }

  if (listeners.onFocused) {
    disposers.push(window.api.browser.onFocused(listeners.onFocused));
  }

  if (listeners.onPermissionRequest) {
    disposers.push(window.api.browser.onPermissionRequest(listeners.onPermissionRequest));
  }

  if (listeners.onContextMenuRequest) {
    disposers.push(window.api.browser.onContextMenuRequest(listeners.onContextMenuRequest));
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
  const updatePaneConfig = useWorkspaceStore((s) => s.updatePaneConfig);
  const updatePaneTitle = useWorkspaceStore((s) => s.updatePaneTitle);
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
      onFocused: (paneId) => {
        syncWorkspaceFocusForPane(paneId);
      },
      onPermissionRequest: (request) => {
        setPendingPermissionRequest(request);
      },
      onContextMenuRequest: async (request) => {
        const action = await window.api.contextMenu.show(
          buildBrowserContextMenuItems(request),
          request.position,
        );

        if (action === "page-back" && request.canGoBack) {
          void window.api.browser.back(request.paneId);
          return;
        }

        if (action === "page-forward" && request.canGoForward) {
          void window.api.browser.forward(request.paneId);
          return;
        }

        if (action === "page-reload") {
          void window.api.browser.reload(request.paneId);
          return;
        }

        if (action === "page-open-external") {
          window.api.shell.openExternal(request.pageUrl);
          return;
        }

        if (action === "page-inspect") {
          void window.api.browser.toggleDevTools(request.paneId);
          return;
        }

        if (action === "link-open-external" && request.linkUrl) {
          window.api.shell.openExternal(request.linkUrl);
          return;
        }

        if (action === "link-copy" && request.linkUrl) {
          await writeClipboardText(request.linkUrl);
          return;
        }

        if (action === "selection-copy" && request.selectionText) {
          await writeClipboardText(request.selectionText);
          return;
        }

        if (
          action !== "link-open-new-tab" &&
          !(action === "selection-search-web" && request.selectionText)
        ) {
          return;
        }

        const state = useWorkspaceStore.getState();
        const workspaceId = findWorkspaceIdForPane(
          state.workspaces,
          request.paneId,
          state.paneGroups,
        );
        if (!workspaceId) {
          return;
        }

        const workspace = state.workspaces.find((candidate) => candidate.id === workspaceId);
        const groupId =
          workspace?.focusedGroupId ?? (workspace ? collectGroupIds(workspace.root)[0] : null);
        if (!groupId) {
          return;
        }

        const targetUrl =
          action === "link-open-new-tab"
            ? request.linkUrl
            : request.selectionText
              ? getBrowserContextMenuSearchUrl(request.selectionText)
              : null;
        if (!targetUrl) {
          return;
        }

        openBrowserInGroup(workspaceId, groupId, targetUrl);
      },
      onOpenInNewTabRequest: (request) => {
        const state = useWorkspaceStore.getState();

        // When an editor pane (VS Code) tries to open a new window — e.g.
        // the "Open Folder" action after a folder is dragged in — redirect
        // the navigation back into the same editor pane instead of opening
        // a new browser tab.
        const sourcePane = state.panes[request.paneId];
        if (sourcePane?.type === "editor") {
          const folderPath = extractEditorFolderFromUrl(request.url);
          if (folderPath) {
            void window.api.browser.navigate(request.paneId, request.url);
            const folderName = folderPath.split("/").pop() || folderPath;
            updatePaneConfig(request.paneId, { folderPath });
            updatePaneTitle(request.paneId, `VS Code: ${folderName}`);
            return;
          }
        }

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
    handleRuntimeStateChange,
    openBrowserInGroup,
    setPendingPermissionRequest,
    updateBrowserPaneZoom,
    updatePaneConfig,
    updatePaneTitle,
  ]);
}
