import { LoaderCircle } from "lucide-react";
import type { ReactElement } from "react";

import { cn } from "@/lib/utils";
import { paneTypeIcons } from "@/lib/pane-type-meta";
import { useFaviconDataUrl } from "@/hooks/useFaviconDataUrl";
import { useBrowserStore } from "@/store/browser-store";
import type { Pane } from "@/types/workspace";

interface PaneTabIconProps {
  pane: Pane;
  size?: number;
  className?: string;
}

/**
 * The glyph in front of a tab label.
 *
 * For a browser pane this follows the page: a spinner while it loads, then the
 * site's own favicon, then the generic globe if the site has none or the icon
 * fails to resolve. Every other pane type keeps its fixed type icon.
 */
export default function PaneTabIcon({
  pane,
  size = 10,
  className,
}: PaneTabIconProps): ReactElement {
  const isBrowser = pane.type === "browser";
  // Subscribed unconditionally so the hook order is stable across pane types.
  const isLoading = useBrowserStore((s) =>
    isBrowser ? (s.runtimeByPaneId[pane.id]?.isLoading ?? false) : false,
  );
  const faviconDataUrl = useFaviconDataUrl(
    isBrowser ? (pane.config as { faviconUrl?: string }).faviconUrl : undefined,
  );

  if (isBrowser && isLoading) {
    return (
      <LoaderCircle
        width={size}
        height={size}
        aria-hidden
        data-testid="pane-tab-spinner"
        className={cn("shrink-0 animate-spin text-brand", className)}
      />
    );
  }

  if (isBrowser && faviconDataUrl) {
    return (
      <img
        src={faviconDataUrl}
        alt=""
        aria-hidden
        width={size}
        height={size}
        // Favicons are frequently non-square or padded; contain keeps them from
        // being stretched into the tab's square slot.
        className={cn("shrink-0 object-contain", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  const Icon = paneTypeIcons[pane.type] ?? paneTypeIcons.terminal;
  return <Icon width={size} height={size} aria-hidden className={cn("shrink-0", className)} />;
}
