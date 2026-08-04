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
import { useBrowserViewportResize } from "../../hooks/useBrowserViewportResize";
import { useBrowserStore } from "../../store/browser-store";
import { useWorkspaceStore } from "../../store/workspace-store";
import {
  FILL_VIEWPORT,
  parseBrowserViewportSetting,
  resolveBrowserViewportLayout,
  resolveResponsiveViewportSize,
  type BrowserViewportLayout,
  type BrowserViewportSetting,
  type BrowserViewportSize,
} from "../../lib/browser-viewport";
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
  const contentRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const updatePaneConfig = useWorkspaceStore((s) => s.updatePaneConfig);
  const [panel, setPanel] = useState<BrowserViewportSize>({ width: 0, height: 0 });
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const runtimeState = useBrowserStore((s) => s.runtimeByPaneId[paneId]);
  const pendingPermissionRequest = useBrowserStore((s) => s.pendingPermissionRequest);
  const isFindBarOpen = useBrowserStore((s) => s.findBarOpenByPaneId[paneId] ?? false);
  const addressBarFocusToken = useBrowserStore((s) => s.addressBarFocusTokenByPaneId[paneId] ?? 0);
  const findBarFocusToken = useBrowserStore((s) => s.findBarFocusTokenByPaneId[paneId] ?? 0);
  const closeFindBar = useBrowserStore((s) => s.closeFindBar);
  const openFindBar = useBrowserStore((s) => s.openFindBar);
  const clearPendingPermissionRequest = useBrowserStore((s) => s.clearPendingPermissionRequest);
  const upsertRuntimeState = useBrowserStore((s) => s.upsertRuntimeState);
  const initialUrl = useMemo(
    () => normalizeBrowserInput(config.url || "about:blank"),
    [config.url],
  );

  // ── Responsive / device mode ────────────────────────────────────────
  // Validated rather than trusted: this comes back from persisted state, which
  // is spread verbatim on load.
  const viewport = useMemo(() => parseBrowserViewportSetting(config.viewport), [config.viewport]);
  const commitViewport = useCallback(
    (next: BrowserViewportSetting) => {
      updatePaneConfig(paneId, { viewport: next });
    },
    [paneId, updatePaneConfig],
  );

  // Track the pane content box so the device frame can be centered in it and
  // fit-scaled when the requested size does not fit.
  useLayoutEffect(() => {
    const element = contentRef.current;
    if (!element) return;

    const measure = (): void => {
      const rect = element.getBoundingClientRect();
      setPanel((current) => {
        const width = Math.max(0, Math.round(rect.width));
        const height = Math.max(0, Math.round(rect.height));
        return current.width === width && current.height === height ? current : { width, height };
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Scale of the *committed* frame. Drags convert pointer distance to CSS px
  // through this; deriving it from the live dragging size instead would move
  // the mapping under the user as the frame crosses the fit-to-panel boundary.
  const committedRenderScale = useMemo(
    () => resolveBrowserViewportLayout(panel, viewport, config.zoom ?? 1).zoomFactor,
    [config.zoom, panel, viewport],
  );

  const { activeDrag, effectiveViewport, handleResizeKeyDown, handleResizePointerDown } =
    useBrowserViewportResize({
      viewport,
      panel,
      renderScale: committedRenderScale,
      aspectRatio,
      onCommit: commitViewport,
    });

  const layout: BrowserViewportLayout = useMemo(
    () => resolveBrowserViewportLayout(panel, effectiveViewport, config.zoom ?? 1),
    [config.zoom, effectiveViewport, panel],
  );

  const toggleDeviceMode = useCallback(() => {
    commitViewport(
      viewport.kind === "device"
        ? FILL_VIEWPORT
        : { kind: "device", ...resolveResponsiveViewportSize(panel, config.zoom ?? 1) },
    );
  }, [commitViewport, config.zoom, panel, viewport.kind]);
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

    // The factor pushed to Electron is the user's zoom times the fit-to-panel
    // scale, which is what keeps the guest laying out at the requested device
    // width even when the frame had to be shrunk to fit. In fill mode the fit
    // scale is 1 and this is just the user's zoom.
    if (Math.abs(runtimeState.currentZoom - layout.zoomFactor) > 0.001) {
      void window.api.browser.setZoom(paneId, layout.zoomFactor);
    }
  }, [layout.zoomFactor, paneId, runtimeState]);

  // A new browser tab opens on about:blank with nothing to look at, so put the
  // caret in the address bar and let the user just type. A restored pane
  // carries its own URL, which is what keeps this from firing on every session
  // restore; a background tab is skipped so opening one cannot steal focus.
  const didRequestInitialFocusRef = useRef(false);
  useEffect(() => {
    if (didRequestInitialFocusRef.current || paneSession.phase !== "ready") {
      return;
    }

    if (initialUrl !== "about:blank") {
      // Opened at a URL, or restored with one. Nothing to type.
      didRequestInitialFocusRef.current = true;
      return;
    }

    // Wait for focus rather than giving up on it. A pane can reach "ready"
    // a render before its group is marked focused, and a tab opened in the
    // background should still get a focused address bar when it is switched
    // to. The initialUrl guard above closes this off the moment the pane
    // navigates anywhere, so it cannot fire over a page the user is reading.
    if (!isFocused || !isActive) {
      return;
    }

    didRequestInitialFocusRef.current = true;
    useBrowserStore.getState().requestAddressBarFocus(paneId);
  }, [initialUrl, isActive, isFocused, paneId, paneSession.phase]);

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

  const handleOpenFindBar = useCallback(() => {
    openFindBar(paneId);
  }, [openFindBar, paneId]);

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

  // ── Zoom ────────────────────────────────────────────────────────────
  const userZoom = config.zoom ?? 1;
  const setUserZoom = useCallback(
    (next: number) => {
      // Matches the app-level zoom shortcuts' range and step rounding.
      updatePaneConfig(paneId, { zoom: Math.min(3, Math.max(0.25, Number(next.toFixed(2)))) });
    },
    [paneId, updatePaneConfig],
  );
  const handleZoomIn = useCallback(() => setUserZoom(userZoom + 0.1), [setUserZoom, userZoom]);
  const handleZoomOut = useCallback(() => setUserZoom(userZoom - 0.1), [setUserZoom, userZoom]);
  const handleZoomReset = useCallback(() => setUserZoom(1), [setUserZoom]);

  return {
    activeDrag,
    activePermissionRequest,
    aspectRatio,
    canGoBack,
    canGoForward,
    contentRef,
    currentUrl,
    effectiveViewport,
    failure,
    handleResizeKeyDown,
    handleResizePointerDown,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
    layout,
    panel,
    setAspectRatio,
    toggleDeviceMode,
    userZoom,
    commitViewport,
    findBarFocusToken,
    findState,
    handleAddressBarSubmit,
    handleCloseFindBar,
    handleDismissPermissionPrompt,
    handleOpenFindBar,
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
