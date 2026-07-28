import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";

interface PaneStatusCardProps {
  /** Short mono label above the title — "Editor error", "Pane recovery". */
  eyebrow: string;
  title: string;
  tone?: "warning" | "error";
  /**
   * Layer the card over the pane instead of replacing it. Native-view panes
   * keep their placeholder mounted, so their failure state has to sit on top.
   */
  overlay?: boolean;
  children: React.ReactNode;
}

/**
 * The "this pane can't run right now" card.
 *
 * Terminal, editor, T3 and browser panes all fail in their own way but say so
 * in the same shape: an eyebrow naming the fault, a one-line title, the detail,
 * and usually a retry. Each used to carry its own copy of the markup, and they
 * had already drifted apart in icon, width and text sizing.
 */
export function PaneStatusCard({
  eyebrow,
  title,
  tone = "error",
  overlay = false,
  children,
}: PaneStatusCardProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center bg-background p-6",
        overlay ? "absolute inset-0 z-[1]" : "h-full w-full",
      )}
    >
      <div className="flex max-w-md flex-col items-start gap-3 rounded-lg border border-border bg-card p-5 shadow-overlay">
        <div
          className={cn(
            "inline-flex items-center gap-1.5 font-mono text-ui-micro uppercase tracking-[0.12em]",
            tone === "error" ? "text-destructive" : "text-status-warning",
          )}
        >
          <AlertTriangle size={11} />
          {eyebrow}
        </div>
        <h2 className="text-ui-lg font-medium leading-snug text-foreground">{title}</h2>
        {children}
      </div>
    </div>
  );
}
