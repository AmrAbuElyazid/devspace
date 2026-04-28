import { type ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Kbd, KbdGroup } from "@/components/ui/kbd";

interface HintTooltipProps {
  /** The trigger — wrapped in a non-interactive span so Tooltip can attach. */
  children: ReactNode;
  /** Short label shown in the tip. */
  content: ReactNode;
  /** Optional shortcut hint (e.g. "Cmd+K", "⌘ Shift P"). Tokens get split on
   *  `+` or whitespace. */
  shortcut?: string;
  /** Tooltip side. Defaults to "bottom" — most triggers sit in top bars. */
  side?: "top" | "right" | "bottom" | "left";
  /** Pixel offset from the trigger. */
  sideOffset?: number;
  /** Cross-axis alignment. Use "end" near right edges to keep the popup
   *  inside the renderer (Electron native views clip overflowing tooltips). */
  align?: "start" | "center" | "end";
  /** Disable the tooltip without removing the trigger. */
  disabled?: boolean;
}

/**
 * App-wide tooltip with content + optional shortcut. The trigger is wrapped
 * in a span so we can hint over arbitrary elements (icons, buttons, divs)
 * without forcing them to be a button themselves.
 */
export function HintTooltip({
  children,
  content,
  shortcut,
  side = "bottom",
  sideOffset = 6,
  align = "center",
  disabled = false,
}: HintTooltipProps) {
  if (disabled) return <>{children}</>;

  const tokens = shortcut ? shortcut.split(/[+\s]+/).filter(Boolean) : [];

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex">{children as any}</span>} />
      <TooltipContent
        side={side}
        sideOffset={sideOffset}
        align={align}
        className="gap-2 px-2 py-1 text-[11px]"
      >
        <span>{content}</span>
        {tokens.length > 0 && (
          <KbdGroup className="gap-0.5">
            {tokens.map((t, i) => (
              <Kbd key={i} className="h-4 min-w-4 px-1 text-[9px] font-mono">
                {t}
              </Kbd>
            ))}
          </KbdGroup>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
