import { useEffect, useRef, useState, useCallback, type ReactElement } from "react";
import { AlertCircle } from "lucide-react";

import { focusBrowserNativePane, hasEditableRendererFocus } from "@/lib/native-pane-focus";
import { useNativeView } from "@/hooks/useNativeView";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

const startedInstances = new Set<string>();

export function markT3CodeDestroyed(paneId: string): void {
  startedInstances.delete(paneId);
}

interface T3CodePaneProps {
  paneId: string;
  isFocused: boolean;
}

type T3CodeState =
  | { status: "starting" }
  | { status: "running" }
  | { status: "error"; message: string }
  | { status: "unavailable" };

export default function T3CodePane({ paneId, isFocused }: T3CodePaneProps): ReactElement {
  const placeholderRef = useRef<HTMLDivElement>(null);
  const wasVisibleRef = useRef(false);
  const wasFocusedRef = useRef(false);

  const [state, setState] = useState<T3CodeState>(() =>
    startedInstances.has(paneId) ? { status: "running" } : { status: "starting" },
  );

  const { isVisible } = useNativeView({
    id: paneId,
    type: "browser",
    ref: placeholderRef,
    enabled: state.status === "running",
  });

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
    if (state.status !== "starting") return;
    if (startedInstances.has(paneId)) {
      setState({ status: "running" });
      return;
    }
    let cancelled = false;
    void (async () => {
      const available = await window.api.t3code.isAvailable();
      if (cancelled) return;
      if (!available) {
        setState({ status: "unavailable" });
        return;
      }
      const result = await window.api.t3code.start(paneId);
      if (cancelled) return;
      if ("error" in result) {
        setState({ status: "error", message: result.error });
        return;
      }
      startedInstances.add(paneId);
      setState({ status: "running" });
    })();
    return () => {
      cancelled = true;
    };
  }, [paneId, state.status]);

  const handleRetry = useCallback(() => {
    setState({ status: "starting" });
  }, []);

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
