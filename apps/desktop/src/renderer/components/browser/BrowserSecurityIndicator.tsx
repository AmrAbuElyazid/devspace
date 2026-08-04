import { Globe, ShieldAlert, ShieldCheck } from "lucide-react";
import type { ReactElement } from "react";

import { cn } from "@/lib/utils";
import { HintTooltip } from "@/components/ui/hint-tooltip";

interface BrowserSecurityIndicatorProps {
  isSecure: boolean;
  securityLabel: string | null;
}

/**
 * Lock glyph seated inside the address field, the way every browser does it.
 *
 * This used to be a separate bordered "SECURE" pill sitting outside the field,
 * which spent a chunk of a dense toolbar restating the `https://` the user can
 * already read, and drew the eye to the safe case rather than the unsafe one.
 * As a glyph it costs 20px, and only the states worth noticing — a cert error,
 * or a plain-HTTP page — carry any color.
 */
export default function BrowserSecurityIndicator({
  isSecure,
  securityLabel,
}: BrowserSecurityIndicatorProps): ReactElement {
  const isCertError = securityLabel === "Certificate error";
  const label = securityLabel ?? (isSecure ? "Connection is secure" : "Not secure");
  const Icon = isCertError ? ShieldAlert : isSecure ? ShieldCheck : Globe;

  return (
    <HintTooltip content={label} dense>
      <span
        aria-label={label}
        role="img"
        className={cn(
          "inline-flex size-5 shrink-0 items-center justify-center rounded",
          isCertError
            ? "text-destructive"
            : isSecure
              ? "text-muted-foreground"
              : "text-warning-foreground",
        )}
      >
        <Icon size={13} strokeWidth={1.8} />
      </span>
    </HintTooltip>
  );
}
