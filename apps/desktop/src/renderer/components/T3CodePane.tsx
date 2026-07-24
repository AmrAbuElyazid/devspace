import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from "react";
import { AlertCircle } from "lucide-react";

import { focusBrowserNativePane, hasEditableRendererFocus } from "@/lib/native-pane-focus";
import { useNativeView } from "@/hooks/useNativeView";
import {
  getEmbeddedToolViewSnapshot,
  markEmbeddedToolViewActive,
  markEmbeddedToolViewCreated,
  markEmbeddedToolViewDestroyed,
  markEmbeddedToolViewFailed,
  markEmbeddedToolViewInactive,
  markEmbeddedToolViewReady,
  subscribeEmbeddedToolView,
} from "@/lib/embedded-tool-view-session";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function markT3CodeDestroyed(paneId: string): void {
  markEmbeddedToolViewDestroyed(paneId);
}

interface T3CodePaneProps {
  paneId: string;
  isFocused: boolean;
  isActive?: boolean;
}

type T3CodeState =
  | { status: "starting" }
  | { status: "running" }
  | { status: "error"; message: string }
  | { status: "unavailable" };

export default function T3CodePane({
  paneId,
  isFocused,
  isActive = true,
}: T3CodePaneProps): ReactElement {
  const placeholderRef = useRef<HTMLDivElement>(null);
  const wasVisibleRef = useRef(false);
  const wasFocusedRef = useRef(false);
  const subscribeToView = useCallback(
    (listener: () => void) => subscribeEmbeddedToolView(paneId, listener),
    [paneId],
  );
  const readViewSession = useCallback(() => getEmbeddedToolViewSnapshot(paneId), [paneId]);
  const viewSession = useSyncExternalStore(subscribeToView, readViewSession, readViewSession);

  const [state, setState] = useState<T3CodeState>(() => {
    if (viewSession.phase === "ready") return { status: "running" };
    if (viewSession.phase === "error") {
      return { status: "error", message: viewSession.error ?? "T3 Code failed to start" };
    }
    return { status: "starting" };
  });

  const { isVisible } = useNativeView({
    id: paneId,
    type: "browser",
    ref: placeholderRef,
    enabled: state.status === "running" && viewSession.phase === "ready",
  });

  useEffect(() => {
    if (viewSession.phase === "ready" && state.status !== "running") {
      setState({ status: "running" });
      return;
    }
    if (viewSession.phase === "error" && state.status !== "error") {
      setState({ status: "error", message: viewSession.error ?? "T3 Code failed to start" });
      return;
    }
    if (viewSession.phase === "missing" && state.status === "running") {
      setState({ status: "starting" });
    }
  }, [state.status, viewSession.error, viewSession.phase]);

  useEffect(() => {
    const wasVisible = wasVisibleRef.current;
    const wasFocused = wasFocusedRef.current;
    wasVisibleRef.current = isVisible;
    wasFocusedRef.current = isFocused;
    if (!isVisible || state.status !== "running" || hasEditableRendererFocus() || !isFocused) {
      return;
    }
    if (wasVisible && wasFocused) return;
    focusBrowserNativePane(paneId);
  }, [isFocused, isVisible, paneId, state.status]);

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
    if (state.status !== "starting") return;
    if (viewSession.phase === "ready") {
      setState({ status: "running" });
      return;
    }
    if (viewSession.phase === "pending") return;
    if (viewSession.phase === "error") {
      setState({ status: "error", message: viewSession.error ?? "T3 Code failed to start" });
      return;
    }
    let cancelled = false;
    const generation = markEmbeddedToolViewCreated(paneId, () => {
      void window.api.browser.destroy(paneId);
    });
    void (async () => {
      const available = await window.api.t3code.isAvailable();
      if (!available) {
        markEmbeddedToolViewDestroyed(paneId);
        if (!cancelled) setState({ status: "unavailable" });
        return;
      }
      const result = await window.api.t3code.start(paneId);
      if ("error" in result) {
        markEmbeddedToolViewFailed(paneId, generation, result.error);
        if (!cancelled) setState({ status: "error", message: result.error });
        return;
      }
      markEmbeddedToolViewReady(paneId, generation);
      if (cancelled) return;
      setState({ status: "running" });
    })();
    return () => {
      cancelled = true;
    };
  }, [paneId, state.status, viewSession.error, viewSession.phase]);

  const handleRetry = useCallback(() => {
    markEmbeddedToolViewDestroyed(paneId);
    setState({ status: "starting" });
  }, [paneId]);

  if (state.status === "unavailable") {
    return (
      <PaneStatusCard eyebrow="T3 Code unavailable" title="CLI not found" tone="warning">
        <p className="text-[12px] text-muted-foreground leading-relaxed">
          Install the T3 Code CLI with{" "}
          <code className="px-1.5 py-0.5 rounded bg-surface font-mono text-[10.5px] text-foreground">
            npm install -g t3
          </code>
          .
        </p>
      </PaneStatusCard>
    );
  }

  if (state.status === "error") {
    return (
      <PaneStatusCard eyebrow="T3 Code error" title="Failed to start" tone="error">
        <p className="text-[12px] text-muted-foreground leading-relaxed self-stretch">
          {state.message}
        </p>
        <Button size="sm" onClick={handleRetry}>
          Retry
        </Button>
      </PaneStatusCard>
    );
  }

  if (state.status === "starting") {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-2 bg-background">
        <Spinner className="size-4 text-muted-foreground" />
        <p className="text-[11.5px] font-mono text-muted-foreground">starting t3 code…</p>
      </div>
    );
  }

  return (
    <div
      ref={placeholderRef}
      className="absolute inset-0 bg-background data-[hidden=true]:invisible"
      data-hidden={!isVisible ? "true" : undefined}
    />
  );
}

function PaneStatusCard({
  eyebrow,
  title,
  tone,
  children,
}: {
  eyebrow: string;
  title: string;
  tone: "warning" | "error";
  children: React.ReactNode;
}) {
  return (
    <div className="h-full w-full flex items-center justify-center p-6 bg-background">
      <div className="flex flex-col items-start gap-3 max-w-md p-5 rounded-lg bg-card border border-border shadow-[var(--overlay-shadow)]">
        <div
          className={`inline-flex items-center gap-1.5 text-[9.5px] font-mono uppercase tracking-[0.12em] ${
            tone === "error" ? "text-destructive" : "text-status-warning"
          }`}
        >
          <AlertCircle size={11} />
          {eyebrow}
        </div>
        <div className="text-[14px] font-medium text-foreground leading-snug">{title}</div>
        {children}
      </div>
    </div>
  );
}
