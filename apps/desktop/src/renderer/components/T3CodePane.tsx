import { useCallback, type ReactElement } from "react";

import { useEmbeddedWebPane, type EmbeddedWebPaneStartResult } from "@/hooks/useEmbeddedWebPane";
import { markEmbeddedToolViewDestroyed } from "@/lib/embedded-tool-view-session";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { PaneStatusCard } from "@/components/ui/pane-status-card";

export function markT3CodeDestroyed(paneId: string): void {
  markEmbeddedToolViewDestroyed(paneId);
}

interface T3CodePaneProps {
  paneId: string;
  isFocused: boolean;
  isActive?: boolean;
}

export default function T3CodePane({
  paneId,
  isFocused,
  isActive = true,
}: T3CodePaneProps): ReactElement {
  // Availability is answered as part of starting rather than in a separate
  // probe phase: the CLI lookup is cheap and this keeps it to one round trip.
  const start = useCallback(async (): Promise<EmbeddedWebPaneStartResult> => {
    const available = await window.api.t3code.isAvailable();
    if (!available) return { unavailable: true };

    const result = await window.api.t3code.start(paneId);
    if ("cancelled" in result) return { cancelled: true };
    if ("error" in result) return { error: result.error };
    return { started: true };
  }, [paneId]);

  const { status, errorMessage, isVisible, placeholderRef, retry } = useEmbeddedWebPane({
    paneId,
    isFocused,
    isActive,
    defaultErrorMessage: "T3 Code failed to start",
    start,
  });

  if (status === "unavailable") {
    return (
      <PaneStatusCard eyebrow="T3 Code unavailable" title="CLI not found" tone="warning">
        <p className="text-ui-sm text-muted-foreground leading-relaxed">
          Install the T3 Code CLI with{" "}
          <code className="px-1.5 py-0.5 rounded bg-surface font-mono text-ui-micro text-foreground">
            npm install -g t3
          </code>
          .
        </p>
      </PaneStatusCard>
    );
  }

  if (status === "error") {
    return (
      <PaneStatusCard eyebrow="T3 Code error" title="Failed to start" tone="error">
        <p className="text-ui-sm text-muted-foreground leading-relaxed self-stretch">
          {errorMessage}
        </p>
        <Button size="sm" onClick={retry}>
          Retry
        </Button>
      </PaneStatusCard>
    );
  }

  if (status === "checking" || status === "starting") {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-2 bg-background">
        <Spinner className="size-4 text-muted-foreground" />
        <p className="text-ui-xs font-mono text-muted-foreground">starting t3 code…</p>
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
