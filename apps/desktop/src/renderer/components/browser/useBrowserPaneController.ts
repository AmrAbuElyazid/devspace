import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
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
import { hasEditableRendererFocus, releaseNativeFocus } from "../../lib/native-pane-focus";

interface UseBrowserPaneControllerArgs {
  paneId: string;
  workspaceId: string;
  config: BrowserConfig;
}

export function useBrowserPaneController({ paneId, config }: UseBrowserPaneControllerArgs) {
  const [paneReady, setPaneReady] = useState(() => hasCreatedBrowserPane(paneId));
  const placeholderRef = useRef<HTMLDivElement>(null);
  const createAttemptRef = useRef(0);
  const unmountedRef = useRef(false);
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
  const wasVisibleRef = useRef(false);
  const activePermissionRequest =
    pendingPermissionRequest?.paneId === paneId ? pendingPermissionRequest : null;

  useEffect(() => {
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  // Queue native browser creation during layout so the create IPC is already
  // in flight before useNativeView's registration effect can reconcile.
  useLayoutEffect(() => {
    if (paneReady) {
      return;
    }

    if (hasCreatedBrowserPane(paneId)) {
      setPaneReady(true);
      return;
    }

    const attemptId = ++createAttemptRef.current;
    markBrowserPaneCreated(paneId);
    setPaneReady(true);

    void window.api.browser.create(paneId, initialUrl).catch(() => {
      if (!unmountedRef.current && createAttemptRef.current === attemptId) {
        markBrowserPaneDestroyed(paneId);
      }
    });
  }, [initialUrl, paneId, paneReady]);

  const { isVisible } = useNativeView({
    id: paneId,
    type: "browser",
    ref: placeholderRef,
    enabled: paneReady && failure === null,
  });

  useEffect(() => {
    if (runtimeState) {
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
  }, [paneId, runtimeState, upsertRuntimeState]);

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
    wasVisibleRef.current = isVisible;

    if (
      !isVisible ||
      wasVisible ||
      failure !== null ||
      isFindBarOpen ||
      hasEditableRendererFocus()
    ) {
      return;
    }

    void window.api.browser.setFocus(paneId);
  }, [failure, isFindBarOpen, isVisible, paneId]);

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
            void window.api.browser.setFocus(paneId);
          });
        }
        return;
      }

      if (event.key === "Escape") {
        setInputUrl(currentUrl);
        inputRef.current?.blur();
        if (isVisible && failure === null) {
          requestAnimationFrame(() => {
            void window.api.browser.setFocus(paneId);
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
      void window.api.browser.setFocus(paneId);
    }
  }, [closeFindBar, failure, isVisible, paneId]);

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
