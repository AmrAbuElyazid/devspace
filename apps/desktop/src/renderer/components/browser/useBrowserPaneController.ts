import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";
import { getAddressBarSubmitValue, normalizeBrowserInput } from "../../lib/browser-url";
import {
  getBrowserPaneSessionSnapshot,
  hasCreatedBrowserPane,
  markBrowserPaneActive,
  markBrowserPaneCreated,
  markBrowserPaneDestroyed,
  markBrowserPaneFailed,
  markBrowserPaneInactive,
  markBrowserPaneReady,
  subscribeBrowserPane,
} from "../../lib/browser-pane-session";
import { useNativeView } from "../../hooks/useNativeView";
import { useBrowserStore } from "../../store/browser-store";
import type { BrowserConfig } from "../../types/workspace";
import type { BrowserPermissionDecision } from "../../../shared/browser";
import {
  focusBrowserNativePane,
  hasEditableRendererFocus,
  releaseNativeFocus,
} from "../../lib/native-pane-focus";

interface UseBrowserPaneControllerArgs {
  paneId: string;
  workspaceId: string;
  config: BrowserConfig;
  isFocused: boolean;
  isActive: boolean;
}

export function useBrowserPaneController({
  paneId,
  config,
  isFocused,
  isActive,
}: UseBrowserPaneControllerArgs) {
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
  const subscribeToPane = useCallback(
    (listener: () => void) => subscribeBrowserPane(paneId, listener),
    [paneId],
  );
  const readPaneSession = useCallback(() => getBrowserPaneSessionSnapshot(paneId), [paneId]);
  const paneSession = useSyncExternalStore(subscribeToPane, readPaneSession, readPaneSession);
  const creationFailure = useMemo(
    () =>
      paneSession.phase === "error"
        ? {
            kind: "crash" as const,
            detail: paneSession.error ?? "Browser pane failed to start.",
            url: initialUrl,
          }
        : null,
    [initialUrl, paneSession.error, paneSession.phase],
  );
  const failure = runtimeState?.failure ?? creationFailure;
  const wasVisibleRef = useRef(false);
  const wasFocusedRef = useRef(false);
  const activePermissionRequest =
    pendingPermissionRequest?.paneId === paneId ? pendingPermissionRequest : null;

  useEffect(() => {
    return () => {
      markBrowserPaneInactive(paneId, (stalePaneId) => {
        void window.api.browser.destroy(stalePaneId);
        useBrowserStore.getState().clearRuntimeState(stalePaneId);
      });
    };
  }, [paneId]);

  useEffect(() => {
    if (!isActive) {
      markBrowserPaneInactive(paneId, (stalePaneId) => {
        void window.api.browser.destroy(stalePaneId);
        useBrowserStore.getState().clearRuntimeState(stalePaneId);
      });
      return;
    }

    markBrowserPaneActive(paneId);
  }, [isActive, paneId, paneSession.phase]);

  // Queue native browser creation during layout so the create IPC is already
  // in flight before useNativeView's registration effect can reconcile.
  useLayoutEffect(() => {
    if (!isActive || paneSession.phase !== "missing" || hasCreatedBrowserPane(paneId)) return;

    const generation = markBrowserPaneCreated(paneId);

    void window.api.browser
      .create(paneId, initialUrl)
      .then(() => {
        markBrowserPaneReady(
          paneId,
          (stalePaneId) => {
            void window.api.browser.destroy(stalePaneId);
            useBrowserStore.getState().clearRuntimeState(stalePaneId);
          },
          generation,
        );
      })
      .catch((error: unknown) => {
        markBrowserPaneFailed(
          paneId,
          generation,
          error instanceof Error ? error.message : String(error),
        );
      });
  }, [initialUrl, isActive, paneId, paneSession.phase]);

  const { isVisible } = useNativeView({
    id: paneId,
    type: "browser",
    ref: placeholderRef,
    enabled: paneSession.phase === "ready" && failure === null,
  });

  useEffect(() => {
    if (runtimeState || paneSession.phase !== "ready") {
      return;
    }

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
  }, [paneId, paneSession.phase, runtimeState, upsertRuntimeState]);

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

    releaseNativeFocus();
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [addressBarFocusToken]);

  useEffect(() => {
    const wasVisible = wasVisibleRef.current;
    const wasFocused = wasFocusedRef.current;
    wasVisibleRef.current = isVisible;
    wasFocusedRef.current = isFocused;

    if (
      !isVisible ||
      failure !== null ||
      isFindBarOpen ||
      hasEditableRendererFocus() ||
      !isFocused
    ) {
      return;
    }

    if (wasVisible && wasFocused) {
      return;
    }

    focusBrowserNativePane(paneId);
  }, [failure, isFindBarOpen, isFocused, isVisible, paneId]);

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
        if (isVisible && failure === null) {
          requestAnimationFrame(() => {
            focusBrowserNativePane(paneId);
          });
        }
        return;
      }

      if (event.key === "Escape") {
        setInputUrl(currentUrl);
        inputRef.current?.blur();
        if (isVisible && failure === null) {
          requestAnimationFrame(() => {
            focusBrowserNativePane(paneId);
          });
        }
      }
    },
    [currentUrl, failure, handleAddressBarSubmit, isVisible, paneId],
  );

  const handleCloseFindBar = useCallback(() => {
    closeFindBar(paneId);
    void window.api.browser.stopFindInPage(paneId);
    if (isVisible && failure === null) {
      focusBrowserNativePane(paneId);
    }
  }, [closeFindBar, failure, isVisible, paneId]);

  const handleFailureRetry = useCallback(() => {
    if (creationFailure) {
      markBrowserPaneDestroyed(paneId);
      useBrowserStore.getState().clearRuntimeState(paneId);
      return;
    }
    void window.api.browser.reload(paneId);
  }, [creationFailure, paneId]);

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
    handleFailureRetry,
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
