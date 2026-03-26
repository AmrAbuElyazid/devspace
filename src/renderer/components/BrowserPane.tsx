import { useEffect, useMemo, useRef, useState, useCallback, type KeyboardEvent } from "react";
import { ArrowLeft, ArrowRight, RotateCw, Search, X } from "lucide-react";
import {
  buildSearchUrl,
  getAddressBarSubmitValue,
  normalizeBrowserInput,
} from "../lib/browser-url";
import {
  hasCreatedBrowserPane,
  markBrowserPaneCreated,
  markBrowserPaneDestroyed,
} from "../lib/browser-pane-session";
import { useBrowserBounds } from "../hooks/useBrowserBounds";
import { useBrowserStore } from "../store/browser-store";
import { useWorkspaceStore } from "../store/workspace-store";
import { Button } from "./ui/button";
import { Tooltip } from "./ui/tooltip";
import BrowserSecurityIndicator from "./browser/BrowserSecurityIndicator";
import BrowserFindBar from "./browser/BrowserFindBar";
import BrowserPermissionPrompt from "./browser/BrowserPermissionPrompt";
import BrowserPaneStatusSurface from "./browser/BrowserPaneStatusSurface";
import type { BrowserConfig } from "../types/workspace";
import type { ReactElement } from "react";
import type { BrowserContextMenuRequest, BrowserPermissionDecision } from "../../shared/browser";
import type { ContextMenuItem } from "../../shared/types";

interface BrowserPaneProps {
  paneId: string;
  workspaceId: string;
  config: BrowserConfig;
  isVisible: boolean;
  hideNativeView: boolean;
}

type BrowserContextMenuAction =
  | "page-back"
  | "page-forward"
  | "page-reload"
  | "page-inspect"
  | "link-open-new-tab"
  | "link-copy"
  | "selection-copy"
  | "selection-search-web";

function buildContextMenuItems(
  request: BrowserContextMenuRequest,
): ContextMenuItem<BrowserContextMenuAction>[] {
  if (request.target === "link") {
    return [
      { id: "link-open-new-tab", label: "Open in New Tab" },
      { id: "link-copy", label: "Copy Link" },
    ];
  }

  if (request.target === "selection") {
    return [
      { id: "selection-copy", label: "Copy" },
      { id: "selection-search-web", label: "Search the Web" },
    ];
  }

  return [
    { id: "page-back", label: "Back" },
    { id: "page-forward", label: "Forward" },
    { id: "page-reload", label: "Reload" },
    { id: "page-inspect", label: "Inspect" },
  ];
}

async function writeClipboardText(value: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
  }
}

export default function BrowserPane({
  paneId,
  workspaceId,
  config,
  isVisible,
  hideNativeView,
}: BrowserPaneProps): ReactElement {
  const placeholderRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const runtimeState = useBrowserStore((s) => s.runtimeByPaneId[paneId]);
  const pendingPermissionRequest = useBrowserStore((s) => s.pendingPermissionRequest);
  const isFindBarOpen = useBrowserStore((s) => s.findBarOpenByPaneId[paneId] ?? false);
  const addressBarFocusToken = useBrowserStore((s) => s.addressBarFocusTokenByPaneId[paneId] ?? 0);
  const findBarFocusToken = useBrowserStore((s) => s.findBarFocusTokenByPaneId[paneId] ?? 0);
  const closeFindBar = useBrowserStore((s) => s.closeFindBar);
  const clearPendingPermissionRequest = useBrowserStore((s) => s.clearPendingPermissionRequest);
  const openBrowserInGroup = useWorkspaceStore((s) => s.openBrowserInGroup);
  const initialUrl = useMemo(
    () => normalizeBrowserInput(config.url || "about:blank"),
    [config.url],
  );
  const [inputUrl, setInputUrl] = useState(initialUrl);
  const failure = runtimeState?.failure ?? null;
  const shouldHideNativeView = hideNativeView || failure !== null;
  const activePermissionRequest =
    pendingPermissionRequest?.paneId === paneId ? pendingPermissionRequest : null;

  useBrowserBounds({
    paneId,
    enabled: isVisible && !shouldHideNativeView,
    ref: placeholderRef,
  });

  useEffect(() => {
    let cancelled = false;

    if (hasCreatedBrowserPane(paneId)) {
      return () => {
        cancelled = true;
      };
    }

    markBrowserPaneCreated(paneId);
    void window.api.browser.create(paneId, initialUrl).catch(() => {
      if (!cancelled) {
        markBrowserPaneDestroyed(paneId);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [initialUrl, paneId]);

  useEffect(() => {
    if (runtimeState?.url) {
      setInputUrl(runtimeState.url);
    }
  }, [runtimeState?.url]);

  useEffect(() => {
    if (!runtimeState) {
      return;
    }

    const desiredZoom = config.zoom ?? 1;
    if (Math.abs(runtimeState.currentZoom - desiredZoom) > 0.001) {
      void window.api.browser.setZoom(paneId, desiredZoom);
    }
  }, [config.zoom, paneId, runtimeState]);

  useEffect(() => {
    if (addressBarFocusToken === 0) {
      return;
    }

    inputRef.current?.focus();
    inputRef.current?.select();
  }, [addressBarFocusToken]);

  useEffect(() => {
    const nextVisible = isVisible && !shouldHideNativeView;
    const action = nextVisible ? window.api.browser.show : window.api.browser.hide;
    void action(paneId);
  }, [isVisible, paneId, shouldHideNativeView]);

  const currentUrl = runtimeState?.url ?? initialUrl;
  const isLoading = runtimeState?.isLoading ?? false;
  const canGoBack = runtimeState?.canGoBack ?? false;
  const canGoForward = runtimeState?.canGoForward ?? false;
  const isSecure = runtimeState?.isSecure ?? false;
  const securityLabel = runtimeState?.securityLabel ?? null;
  const findState = runtimeState?.find;

  const handleNavigate = useCallback(
    (value: string) => {
      const normalized = normalizeBrowserInput(value);
      setInputUrl(normalized);
      void window.api.browser.navigate(paneId, normalized);
    },
    [paneId],
  );

  const handleAddressBarSubmit = useCallback(
    (liveInputValue?: string) => {
      handleNavigate(getAddressBarSubmitValue(liveInputValue, inputUrl));
    },
    [handleNavigate, inputUrl],
  );

  const handleReloadOrStop = useCallback(() => {
    if (isLoading) {
      void window.api.browser.stop(paneId);
      return;
    }

    void window.api.browser.reload(paneId);
  }, [isLoading, paneId]);

  const handlePermissionDecision = useCallback(
    (decision: BrowserPermissionDecision) => {
      if (!activePermissionRequest) {
        return;
      }

      clearPendingPermissionRequest();
      void window.api.browser.resolvePermission(activePermissionRequest.requestToken, decision);
    },
    [activePermissionRequest, clearPendingPermissionRequest],
  );

  const handleDismissPermissionPrompt = useCallback(() => {
    handlePermissionDecision("deny");
  }, [handlePermissionDecision]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleAddressBarSubmit((event.currentTarget as HTMLInputElement | null)?.value);
        inputRef.current?.blur();
        return;
      }

      if (event.key === "Escape") {
        setInputUrl(currentUrl);
        inputRef.current?.blur();
      }
    },
    [currentUrl, handleAddressBarSubmit],
  );

  const handleCloseFindBar = useCallback(() => {
    closeFindBar(paneId);
    void window.api.browser.stopFindInPage(paneId);
  }, [closeFindBar, paneId]);

  const handleContextMenuRequest = useCallback(
    async (request: BrowserContextMenuRequest) => {
      if (request.paneId !== paneId) {
        return;
      }

      const items = buildContextMenuItems(request);
      const action = await window.api.contextMenu.show(items, request.position);

      if (action === "page-back" && request.canGoBack) {
        void window.api.browser.back(paneId);
        return;
      }

      if (action === "page-forward" && request.canGoForward) {
        void window.api.browser.forward(paneId);
        return;
      }

      if (action === "page-reload") {
        void window.api.browser.reload(paneId);
        return;
      }

      if (action === "page-inspect") {
        void window.api.browser.toggleDevTools(paneId);
        return;
      }

      if (action === "link-open-new-tab" && request.linkUrl) {
        const wsState = useWorkspaceStore.getState();
        const ws = wsState.workspaces.find((w) => w.id === workspaceId);
        const gId = ws?.focusedGroupId;
        if (gId) openBrowserInGroup(workspaceId, gId, request.linkUrl);
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

      if (action === "selection-search-web" && request.selectionText) {
        const wsState = useWorkspaceStore.getState();
        const ws = wsState.workspaces.find((w) => w.id === workspaceId);
        const gId = ws?.focusedGroupId;
        if (gId) openBrowserInGroup(workspaceId, gId, buildSearchUrl(request.selectionText));
      }
    },
    [openBrowserInGroup, paneId, workspaceId],
  );

  useEffect(() => {
    return window.api.browser.onContextMenuRequest((request) => {
      void handleContextMenuRequest(request);
    });
  }, [handleContextMenuRequest]);

  return (
    <div className="browser-pane-shell">
      <div className="browser-toolbar flex items-center gap-1 shrink-0 px-1">
        <Tooltip content="Back" shortcut="⌘[">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void window.api.browser.back(paneId)}
            disabled={!canGoBack}
            className="browser-nav-btn"
          >
            <ArrowLeft size={16} />
          </Button>
        </Tooltip>

        <Tooltip content="Forward" shortcut="⌘]">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void window.api.browser.forward(paneId)}
            disabled={!canGoForward}
            className="browser-nav-btn"
          >
            <ArrowRight size={16} />
          </Button>
        </Tooltip>

        <Tooltip content={isLoading ? "Stop" : "Reload"} shortcut="⌘R">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleReloadOrStop}
            className="browser-nav-btn"
          >
            {isLoading ? <X size={16} /> : <RotateCw size={14} />}
          </Button>
        </Tooltip>

        <BrowserSecurityIndicator isSecure={isSecure} securityLabel={securityLabel} />

        <input
          ref={inputRef}
          type="text"
          value={inputUrl}
          onChange={(event) => setInputUrl(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => setInputUrl(currentUrl)}
          onFocus={() => inputRef.current?.select()}
          className="browser-url-input flex-1 min-w-0 rounded px-2 text-xs outline-none"
          placeholder="Enter URL or search..."
        />

        <Tooltip content="Go">
          <Button
            variant="ghost"
            size="icon-sm"
            onMouseDown={(event) => {
              event.preventDefault();
              handleAddressBarSubmit(inputRef.current?.value);
            }}
            className="browser-nav-btn"
          >
            <Search size={14} />
          </Button>
        </Tooltip>
      </div>

      {isFindBarOpen && (
        <BrowserFindBar
          paneId={paneId}
          query={findState?.query ?? ""}
          activeMatch={findState?.activeMatch ?? 0}
          totalMatches={findState?.totalMatches ?? 0}
          focusToken={findBarFocusToken}
          onClose={handleCloseFindBar}
        />
      )}

      {isLoading && <div className="browser-loading-bar" />}

      {activePermissionRequest && (
        <BrowserPermissionPrompt
          request={activePermissionRequest}
          onDecision={handlePermissionDecision}
          onDismiss={handleDismissPermissionPrompt}
        />
      )}

      <div className="browser-shell-viewport">
        {failure && (
          <BrowserPaneStatusSurface
            failure={failure}
            onPrimaryAction={() => void window.api.browser.reload(paneId)}
          />
        )}
        <div
          ref={placeholderRef}
          className="browser-native-view-slot"
          data-native-view-hidden={!isVisible || shouldHideNativeView ? "true" : undefined}
        />
      </div>
    </div>
  );
}
