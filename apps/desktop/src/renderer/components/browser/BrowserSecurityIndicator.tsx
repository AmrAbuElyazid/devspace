import { Globe, ShieldAlert, ShieldCheck } from "lucide-react";
import type { ReactElement } from "react";

import { cn } from "@/lib/utils";

interface BrowserSecurityIndicatorProps {
  isSecure: boolean;
  securityLabel: string | null;
}

export default function BrowserSecurityIndicator({
  isSecure,
  securityLabel,
}: BrowserSecurityIndicatorProps): ReactElement {
  const label = securityLabel ?? "Not secure";
  const isCertError = securityLabel === "Certificate error";
  const Icon = isCertError ? ShieldAlert : isSecure ? ShieldCheck : Globe;

  return (
    <div
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-1 h-7 px-2 rounded-md shrink-0",
        "bg-surface border border-border/70",
        "text-[10.5px] font-mono uppercase tracking-wide",
        isCertError
          ? "text-destructive border-destructive/40"
          : isSecure
            ? "text-status-success/90 border-status-success/30"
            : "text-muted-foreground",
      )}
    >
      <Icon size={11} strokeWidth={1.8} />
      <span>{label}</span>
    </div>
  );
}
