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
import { syncWorkspaceFocusForNativeNotification } from "../lib/native-pane-focus";
import type { BrowserBridgeListeners, BrowserBridgeUnsubscribe } from "../../shared/types";

const VSCODE_WEB_TITLE_SUFFIX = " - Visual Studio Code";
const VSCODE_WEB_PRODUCT_TITLE = "Visual Studio Code";

function getDefaultEditorPaneTitle(folderPath?: string): string {
  if (!folderPath) {
    return "VS Code";
  }

  const folderName = folderPath.split("/").pop() || folderPath;
  return `VC: ${folderName}`;
}

/** Tab width is ~14 characters; past that the ellipsis carries no information. */
const BROWSER_TITLE_MAX_LENGTH = 60;

/**
 * Tab label for a browser pane.
 *
 * Prefers the page's own title and falls back to the host, so a page that has
 * not set one — or has not finished loading — still says where it is instead
 * of sitting on the generic "Browser". Returns null when there is nothing
 * better to show, leaving the existing title alone.
 */
export function getBrowserPaneTitle(runtimeTitle: string, url: string): string | null {
  const title = runtimeTitle.trim();
  if (title.length > 0 && title !== "about:blank") {
    return title.length > BROWSER_TITLE_MAX_LENGTH
      ? `${title.slice(0, BROWSER_TITLE_MAX_LENGTH - 1).trimEnd()}…`
      : title;
  }

  // Chromium reports the raw URL as the title before a page commits one.
  try {
    const { hostname, protocol } = new URL(url);
    if (hostname) {
      return hostname.replace(/^www\./, "");
    }
    // about:blank and friends have no host and no title worth showing.
    if (protocol === "about:") return null;
  } catch {
    // Not a parseable URL — nothing better than what the pane already has.
  }

  return null;
}

function getManagedEditorPaneTitle(
  currentTitle: string,
  folderPath: string | undefined,
  runtimeTitle: string,
): string | null {
  if (currentTitle !== "VS Code" && !currentTitle.startsWith("VC:")) {
    return null;
  }

  const defaultTitle = getDefaultEditorPaneTitle(folderPath);
  const trimmedRuntimeTitle = runtimeTitle.trim();
  const normalizedRuntimeTitle = trimmedRuntimeTitle.endsWith(VSCODE_WEB_TITLE_SUFFIX)
    ? trimmedRuntimeTitle.slice(0, -VSCODE_WEB_TITLE_SUFFIX.length).trim()
    : trimmedRuntimeTitle;
  const nextTitle =
    normalizedRuntimeTitle.length > 0 && normalizedRuntimeTitle !== VSCODE_WEB_PRODUCT_TITLE
      ? `VC: ${normalizedRuntimeTitle}`
      : defaultTitle;

  return nextTitle === currentTitle ? null : nextTitle;
}

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
          // Zoom is not persisted from runtime state: pane config is the
          // source of truth for the user's zoom, and the factor the main
          // process reports includes device mode's fit-to-panel scale.
        });

        const pane = useWorkspaceStore.getState().panes[state.paneId];

        if (pane?.type === "browser") {
          const nextTitle = getBrowserPaneTitle(state.title, state.url);
          if (nextTitle) {
            updatePaneTitle(state.paneId, nextTitle);
          }
          // Chromium clears the favicon on every navigation before the next
          // page reports one. Persisting that blank would flash the tab back
          // to a globe mid-navigation, so only a real icon is written.
          if (state.faviconUrl && state.faviconUrl !== pane.config.faviconUrl) {
            updatePaneConfig(state.paneId, { faviconUrl: state.faviconUrl });
          }
          return;
        }

        if (pane?.type !== "editor") {
          return;
        }

        const nextTitle = getManagedEditorPaneTitle(
          pane.title,
          pane.config.folderPath,
          state.title,
        );
        if (nextTitle) {
          updatePaneTitle(state.paneId, nextTitle);
        }
      },
      onFocused: (paneId) => {
        syncWorkspaceFocusForNativeNotification(paneId);
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

        if (action === "page-copy-address") {
          await writeClipboardText(request.pageUrl);
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

        if (action === "image-open-external" && request.imageUrl) {
          window.api.shell.openExternal(request.imageUrl);
          return;
        }

        if (action === "image-copy-address" && request.imageUrl) {
          await writeClipboardText(request.imageUrl);
          return;
        }

        if (action === "selection-copy" && request.selectionText) {
          await writeClipboardText(request.selectionText);
          return;
        }

        // Everything below opens a new browser pane in the focused group.
        const opensNewTab =
          (action === "link-open-new-tab" && request.linkUrl !== null) ||
          (action === "image-open-new-tab" && request.imageUrl !== null) ||
          (action === "selection-search-web" && request.selectionText !== null);
        if (!opensNewTab) {
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
            : action === "image-open-new-tab"
              ? request.imageUrl
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
            updatePaneTitle(request.paneId, `VC: ${folderName}`);
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
