import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { getAddressBarSubmitValue, normalizeBrowserInput } from "../../lib/browser-url";
import {
  hasCreatedBrowserPane,
  markBrowserPaneCreated,
  markBrowserPaneDestroyed,
} from "../../lib/browser-pane-session";
import { useNativeView } from "../../hooks/useNativeView";
import { useBrowserStore } from "../../store/browser-store";
import type { BrowserConfig } from "../../types/workspace";
import type { BrowserPermissionDecision } from "../../../shared/browser";

interface UseBrowserPaneControllerArgs {
  paneId: string;
  workspaceId: string;
  config: BrowserConfig;
}

export function useBrowserPaneController({ paneId, config }: UseBrowserPaneControllerArgs) {
  const paneReady = useRef(false);
  const placeholderRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const runtimeState = useBrowserStore((s) => s.runtimeByPaneId[paneId]);
  const pendingPermissionRequest = useBrowserStore((s) => s.pendingPermissionRequest);
  const isFindBarOpen = useBrowserStore((s) => s.findBarOpenByPaneId[paneId] ?? false);
  const addressBarFocusToken = useBrowserStore((s) => s.addressBarFocusTokenByPaneId[paneId] ?? 0);
  const findBarFocusToken = useBrowserStore((s) => s.findBarFocusTokenByPaneId[paneId] ?? 0);
  const closeFindBar = useBrowserStore((s) => s.closeFindBar);
  const clearPendingPermissionRequest = useBrowserStore((s) => s.clearPendingPermissionRequest);
  const upsertRuntimeState = useBrowserStore((s) => s.upsertRuntimeState);
  const initialUrl = useMemo(
    () => normalizeBrowserInput(config.url || "about:blank"),
    [config.url],
  );
  const [inputUrl, setInputUrl] = useState(initialUrl);
  const failure = runtimeState?.failure ?? null;
  const activePermissionRequest =
    pendingPermissionRequest?.paneId === paneId ? pendingPermissionRequest : null;

  // Queue browser creation during render so the create IPC is already in
  // flight before useNativeView's registration effect can reconcile
  // visibility. This matches the terminal pane ordering and avoids a race
  // where setVisiblePanes runs before the main process knows about the pane.
  if (!paneReady.current) {
    if (hasCreatedBrowserPane(paneId)) {
      paneReady.current = true;
    } else {
      markBrowserPaneCreated(paneId);
      void window.api.browser.create(paneId, initialUrl).catch(() => {
        markBrowserPaneDestroyed(paneId);
      });
      paneReady.current = true;
    }
  }

  const { isVisible } = useNativeView({
    id: paneId,
    type: "browser",
    ref: placeholderRef,
    enabled: paneReady.current && failure === null,
  });

  useEffect(() => {
    let cancelled = false;

    void window.api.browser
      .getRuntimeState(paneId)
      .then((state) => {
        if (!cancelled && state) {
          upsertRuntimeState(state);
        }
      })
      .catch(() => {
        // Ignore transient hydration failures; live state-change events can still recover.
      });

    return () => {
      cancelled = true;
    };
  }, [paneId, upsertRuntimeState]);

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

  return {
    activePermissionRequest,
    canGoBack,
    canGoForward,
    currentUrl,
    failure,
    findBarFocusToken,
    findState,
    handleAddressBarSubmit,
    handleCloseFindBar,
    handleDismissPermissionPrompt,
    handleKeyDown,
    handlePermissionDecision,
    handleReloadOrStop,
    inputRef,
    inputUrl,
    isFindBarOpen,
    isLoading,
    isSecure,
    isVisible,
    placeholderRef,
    securityLabel,
    setInputUrl,
  };
}
