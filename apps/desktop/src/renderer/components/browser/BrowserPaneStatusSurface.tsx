import type { ReactElement } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

import type { BrowserFailureState } from "../../../shared/browser";
import { Button } from "@/components/ui/button";

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
    <div className="absolute inset-0 z-[1] flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md flex flex-col items-start gap-3 p-5 rounded-lg bg-card border border-border shadow-[var(--overlay-shadow)]">
        <div className="inline-flex items-center gap-1.5 text-[9.5px] font-mono uppercase tracking-[0.12em] text-status-warning">
          <AlertTriangle size={11} />
          {isCrash ? "Pane recovery" : "Navigation failed"}
        </div>
        <h2 className="text-[15px] font-medium text-foreground leading-snug">
          {isCrash ? "Browser pane crashed" : "Couldn't open this page"}
        </h2>
        <div className="flex flex-col gap-1 min-w-0 self-stretch">
          <p className="text-[11px] font-mono text-muted-foreground truncate">{failure.url}</p>
          <p className="text-[12px] text-muted-foreground leading-relaxed">{failure.detail}</p>
        </div>
        <div className="flex items-center gap-2 mt-1 self-stretch">
          <Button size="sm" onClick={onPrimaryAction}>
            <RefreshCw size={12} data-icon="inline-start" />
            {isCrash ? "Reload pane" : "Try again"}
          </Button>
        </div>
      </div>
    </div>
  );
}
