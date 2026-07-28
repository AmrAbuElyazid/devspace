import type { ReactElement } from "react";
import { RefreshCw } from "lucide-react";

import type { BrowserFailureState } from "../../../shared/browser";
import { Button } from "@/components/ui/button";
import { PaneStatusCard } from "@/components/ui/pane-status-card";

interface BrowserPaneStatusSurfaceProps {
  failure: BrowserFailureState;
  onPrimaryAction: () => void;
}

export default function BrowserPaneStatusSurface({
  failure,
  onPrimaryAction,
}: BrowserPaneStatusSurfaceProps): ReactElement {
  const isCrash = failure.kind === "crash";

  return (
    <PaneStatusCard
      overlay
      tone="warning"
      eyebrow={isCrash ? "Pane recovery" : "Navigation failed"}
      title={isCrash ? "Browser pane crashed" : "Couldn't open this page"}
    >
      <div className="flex min-w-0 flex-col gap-1 self-stretch">
        <p className="truncate font-mono text-ui-xs text-muted-foreground">{failure.url}</p>
        <p className="text-ui-sm leading-relaxed text-muted-foreground">{failure.detail}</p>
      </div>
      <Button size="sm" className="mt-1" onClick={onPrimaryAction}>
        <RefreshCw size={12} data-icon="inline-start" />
        {isCrash ? "Reload pane" : "Try again"}
      </Button>
    </PaneStatusCard>
  );
}
