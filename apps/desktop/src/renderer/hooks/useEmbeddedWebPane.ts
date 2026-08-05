import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";

import { focusBrowserNativePane, hasEditableRendererFocus } from "@/lib/native-pane-focus";
import { useNativeView } from "@/hooks/useNativeView";
import {
  discardEmbeddedToolViewIfCurrent,
  getEmbeddedToolViewSnapshot,
  markEmbeddedToolViewCreated,
  markEmbeddedToolViewDestroyed,
  markEmbeddedToolViewFailed,
  markEmbeddedToolViewInactive,
  markEmbeddedToolViewActive,
  markEmbeddedToolViewReady,
  subscribeEmbeddedToolView,
} from "@/lib/embedded-tool-view-session";

/**
 * What a tool's `start` reports back.
 *
 * `cancelled` is not a failure: main bumps a pane's generation whenever a
 * newer start or a stop takes it over, and showing that as an error puts a
 * "failed to start" card in front of a pane that is simply starting again.
 */
export type EmbeddedWebPaneStartResult =
  | { started: true }
  | { unavailable: true }
  | { cancelled: true }
  | { error: string };

type EmbeddedWebPaneStatus = "checking" | "starting" | "running" | "error" | "unavailable";

interface UseEmbeddedWebPaneOptions {
  paneId: string;
  isFocused: boolean;
  isActive: boolean;
  /** Message for a failure that arrived without one of its own. */
  defaultErrorMessage: string;
  /**
   * Run `checkAvailability` before the first start. Tools that can answer
   * "installed?" as part of starting should leave this false and return
   * `{ unavailable: true }` from `start` instead — one round trip, not two.
   */
  needsAvailabilityCheck?: boolean;
  checkAvailability?: () => Promise<boolean>;
  /** Bring the tool up and create its native view in main. */
  start: () => Promise<EmbeddedWebPaneStartResult>;
  /** Ran after a start lands, before the pane flips to "running". */
  onStarted?: () => void;
  /**
   * Tear the pane down and start over when this changes — the configured VS
   * Code CLI, for instance. The first value seen is the baseline, not a
   * change, and a running pane is left alone.
   */
  restartKey?: string | null;
}

interface UseEmbeddedWebPaneResult {
  status: EmbeddedWebPaneStatus;
  errorMessage: string;
  isVisible: boolean;
  placeholderRef: RefObject<HTMLDivElement | null>;
  retry: () => void;
}

interface EmbeddedWebPaneState {
  status: EmbeddedWebPaneStatus;
  error: string;
}

/**
 * The lifecycle every "a local tool, rendered in a WebContentsView" pane
 * shares: probe, start, track the view session, keep the native view
 * registered while it is on screen, and put the keyboard in it when the user
 * turns to it.
 *
 * Editor (VS Code) and T3 Code panes were separate copies of this and drifted
 * — each fix had to be made twice, and the focus handling was one of the
 * things that only got fixed once.
 */
export function useEmbeddedWebPane({
  paneId,
  isFocused,
  isActive,
  defaultErrorMessage,
  needsAvailabilityCheck = false,
  checkAvailability,
  start,
  onStarted,
  restartKey = null,
}: UseEmbeddedWebPaneOptions): UseEmbeddedWebPaneResult {
  const placeholderRef = useRef<HTMLDivElement>(null);
  const wasVisibleRef = useRef(false);
  const wasFocusedRef = useRef(false);
  const previousRestartKeyRef = useRef<string | null | undefined>(undefined);

  const subscribeToView = useCallback(
    (listener: () => void) => subscribeEmbeddedToolView(paneId, listener),
    [paneId],
  );
  const readViewSession = useCallback(() => getEmbeddedToolViewSnapshot(paneId), [paneId]);
  const viewSession = useSyncExternalStore(subscribeToView, readViewSession, readViewSession);

  const [state, setState] = useState<EmbeddedWebPaneState>(() => {
    const snapshot = getEmbeddedToolViewSnapshot(paneId);
    if (snapshot.phase === "ready") return { status: "running", error: "" };
    if (snapshot.phase === "error") {
      return { status: "error", error: snapshot.error ?? defaultErrorMessage };
    }
    return { status: needsAvailabilityCheck ? "checking" : "starting", error: "" };
  });

  // Read through a ref so a caller can close over fresh props without
  // restarting the pane every time one of them changes identity.
  const callbacksRef = useRef({ start, onStarted, checkAvailability, defaultErrorMessage });
  useEffect(() => {
    callbacksRef.current = { start, onStarted, checkAvailability, defaultErrorMessage };
  });

  // Only registered once the WebContentsView actually exists.
  const { isVisible } = useNativeView({
    id: paneId,
    type: "browser",
    ref: placeholderRef,
    enabled: state.status === "running" && viewSession.phase === "ready",
  });

  const status = state.status;

  useEffect(() => {
    if (status !== "checking") return;
    const probe = callbacksRef.current.checkAvailability;
    if (!probe) {
      setState({ status: "starting", error: "" });
      return;
    }

    let cancelled = false;
    void probe()
      .then((available) => {
        if (cancelled) return;
        setState(
          available ? { status: "starting", error: "" } : { status: "unavailable", error: "" },
        );
      })
      .catch((error: unknown) => {
        // Nothing re-runs this effect while the status stays "checking", so a
        // rejected probe has to move the pane out of it or the spinner never
        // stops.
        if (cancelled) return;
        setState({
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      cancelled = true;
    };
    // restartKey is a dependency so that changing it mid-probe cancels the
    // in-flight answer and asks again — the old one was about the old tool.
  }, [restartKey, status]);

  useEffect(() => {
    if (viewSession.phase === "ready" && status !== "running") {
      setState({ status: "running", error: "" });
      return;
    }
    if (viewSession.phase === "error" && status !== "error") {
      setState({ status: "error", error: viewSession.error ?? defaultErrorMessage });
      return;
    }
    if (viewSession.phase === "missing" && status === "running") {
      setState({ status: "starting", error: "" });
    }
  }, [defaultErrorMessage, status, viewSession.error, viewSession.phase]);

  useEffect(() => {
    return () => {
      markEmbeddedToolViewInactive(paneId);
    };
  }, [paneId]);

  useEffect(() => {
    if (!isActive) {
      markEmbeddedToolViewInactive(paneId);
      return;
    }

    markEmbeddedToolViewActive(paneId);
  }, [isActive, paneId, viewSession.phase]);

  useEffect(() => {
    if (previousRestartKeyRef.current === undefined) {
      previousRestartKeyRef.current = restartKey;
      return;
    }

    if (previousRestartKeyRef.current === restartKey || status === "running") {
      previousRestartKeyRef.current = restartKey;
      return;
    }

    previousRestartKeyRef.current = restartKey;
    markEmbeddedToolViewDestroyed(paneId);
    setState({ status: needsAvailabilityCheck ? "checking" : "starting", error: "" });
  }, [needsAvailabilityCheck, paneId, restartKey, status]);

  useEffect(() => {
    const wasVisible = wasVisibleRef.current;
    const wasFocused = wasFocusedRef.current;
    wasVisibleRef.current = isVisible;
    wasFocusedRef.current = isFocused;

    if (!isVisible || status !== "running" || hasEditableRendererFocus() || !isFocused) {
      return;
    }

    if (wasVisible && wasFocused) {
      return;
    }

    // Reactive: a pane reaching "running" is as often the tool restarting
    // itself — a view rebuilt after an eviction, a VS Code server that just
    // finished downloading — as it is the user selecting the tab. Focusing a
    // web contents activates the app on macOS, so only the user may do it.
    focusBrowserNativePane(paneId, "reactive");
  }, [isFocused, isVisible, paneId, status]);

  useEffect(() => {
    // Evicting an inactive view flips this pane back to "starting", so without
    // this guard the pane immediately rebuilds the view the warm-view budget
    // just reclaimed, only for the next eviction pass to reclaim it again. The
    // restart is deferred until the pane is actually on screen. (The server
    // process behind it is reference-counted in main and is unaffected either
    // way — only the WebContentsView churns.)
    if (!isActive) return;
    if (status !== "starting") return;
    if (viewSession.phase === "ready") {
      setState({ status: "running", error: "" });
      return;
    }
    if (viewSession.phase === "pending") return;
    if (viewSession.phase === "error") {
      setState({ status: "error", error: viewSession.error ?? defaultErrorMessage });
      return;
    }

    let cancelled = false;
    const generation = markEmbeddedToolViewCreated(paneId, () => {
      void window.api.browser.destroy(paneId);
    });

    void (async () => {
      try {
        const result = await callbacksRef.current.start();

        if ("unavailable" in result) {
          markEmbeddedToolViewDestroyed(paneId);
          if (!cancelled) setState({ status: "unavailable", error: "" });
          return;
        }

        if ("cancelled" in result) {
          // A newer start or a stop took this pane over in main. Drop the
          // pending record instead of recording a failure — parking on
          // "pending" would strand the pane, since this effect returns early on
          // that phase and nothing else would ever resolve it.
          discardEmbeddedToolViewIfCurrent(paneId, generation);
          return;
        }

        if ("error" in result) {
          markEmbeddedToolViewFailed(paneId, generation, result.error);
          if (!cancelled) setState({ status: "error", error: result.error });
          return;
        }

        markEmbeddedToolViewReady(paneId, generation);
        if (cancelled) return;

        callbacksRef.current.onStarted?.();
        setState({ status: "running", error: "" });
      } catch (error) {
        // A rejected invoke leaves the session in "pending", and this effect
        // returns early on "pending", so nothing would ever retry it — the pane
        // would spin forever. Record the failure so the error UI (and its retry)
        // can take over.
        const message = error instanceof Error ? error.message : String(error);
        markEmbeddedToolViewFailed(paneId, generation, message);
        if (!cancelled) setState({ status: "error", error: message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [defaultErrorMessage, isActive, paneId, status, viewSession.error, viewSession.phase]);

  const retry = useCallback(() => {
    markEmbeddedToolViewDestroyed(paneId);
    setState({ status: needsAvailabilityCheck ? "checking" : "starting", error: "" });
  }, [needsAvailabilityCheck, paneId]);

  return {
    status,
    errorMessage: state.error,
    isVisible,
    placeholderRef,
    retry,
  };
}
