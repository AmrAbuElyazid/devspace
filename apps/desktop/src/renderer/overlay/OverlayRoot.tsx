import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import type { OverlayMenuItem, OverlayMenuRequest } from "../../shared/overlay";
import type { SidebarPeekSnapshot } from "../../shared/sidebar-peek";
import { SidebarPeekPanel } from "./SidebarPeekPanel";

/** Keeps the menu clear of the window edges. */
const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 4;

interface ActiveMenu {
  token: number;
  request: OverlayMenuRequest;
}

function MenuRow({
  item,
  active,
  onHover,
  onChoose,
}: {
  item: OverlayMenuItem;
  active: boolean;
  onHover: () => void;
  onChoose: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={item.disabled}
      aria-checked={item.checked}
      data-active={active || undefined}
      onMouseEnter={onHover}
      onClick={onChoose}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-ui-sm",
        "text-popover-foreground outline-none transition-colors",
        "disabled:pointer-events-none disabled:opacity-40",
        active && "bg-accent text-accent-foreground",
      )}
    >
      {item.checked !== undefined && (
        <Check size={12} className={cn("shrink-0", !item.checked && "opacity-0")} />
      )}
      <span className="flex-1 truncate">{item.label}</span>
      {item.detail && (
        <span className="shrink-0 font-mono text-ui-micro tabular-nums text-muted-foreground">
          {item.detail}
        </span>
      )}
      {item.shortcut && (
        <span className="shrink-0 font-mono text-ui-micro text-muted-foreground">
          {item.shortcut}
        </span>
      )}
    </button>
  );
}

export default function OverlayRoot(): ReactElement | null {
  const [menu, setMenu] = useState<ActiveMenu | null>(null);
  const [peek, setPeek] = useState<SidebarPeekSnapshot | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  const close = useCallback((id: string | null) => {
    setMenu((current) => {
      if (current) window.api.overlay.resolveMenu(current.token, id);
      return null;
    });
    setPosition(null);
    setActiveIndex(-1);
  }, []);

  useEffect(() => {
    const dispose = window.api.overlay.onMenu(({ token, request }) => {
      document.documentElement.classList.toggle("dark", request.dark !== false);
      setMenu({ token, request });
      setActiveIndex(-1);
      setPosition(null);
    });
    // Only now is it safe for the main process to post a menu here.
    window.api.overlay.notifyReady();
    return dispose;
  }, []);

  useEffect(() => {
    return window.api.sidebarPeek.onPanel((snapshot) => {
      if (snapshot) document.documentElement.classList.toggle("dark", snapshot.dark);
      setPeek(snapshot);
    });
  }, []);

  // Measure after paint, then place. The menu's height depends on its content,
  // so flipping above the anchor can only be decided once it exists.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!menu || !panel) return;

    const { anchor, align = "start" } = menu.request;
    const rect = panel.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const preferredLeft = align === "end" ? anchor.x + anchor.width - rect.width : anchor.x;
    const left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(preferredLeft, viewportWidth - rect.width - VIEWPORT_MARGIN),
    );

    const below = anchor.y + anchor.height + ANCHOR_GAP;
    const fitsBelow = below + rect.height + VIEWPORT_MARGIN <= viewportHeight;
    const top = fitsBelow ? below : Math.max(VIEWPORT_MARGIN, anchor.y - ANCHOR_GAP - rect.height);

    setPosition({ left: Math.round(left), top: Math.round(top) });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;

    const items = menu.request.items;
    const step = (delta: number): void => {
      setActiveIndex((current) => {
        // Skip disabled rows so arrow keys never park on something inert.
        for (let i = 1; i <= items.length; i += 1) {
          const next = (current + delta * i + items.length * i) % items.length;
          if (!items[next]?.disabled) return next;
        }
        return current;
      });
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(null);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        step(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        step(-1);
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        const item = items[activeIndex];
        if (item && !item.disabled) {
          event.preventDefault();
          close(item.id);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, close, menu]);

  // Mutually exclusive: the two want the same surface at different sizes, and
  // the main process closes the panel before it posts a menu.
  if (!menu) {
    return peek ? (
      <SidebarPeekPanel snapshot={peek} onActivate={window.api.sidebarPeek.activate} />
    ) : null;
  }

  const { items, minWidth, label, swatches } = menu.request;

  return (
    // Full-bleed transparent scrim. It is what catches click-outside, and it
    // is the reason the pane underneath stays visible rather than being hidden.
    <div
      className="fixed inset-0"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close(null);
      }}
    >
      <div
        ref={panelRef}
        role="menu"
        aria-label={label ?? "Menu"}
        className={cn(
          "glass-dropdown absolute flex flex-col gap-px rounded-lg p-1",
          // Hidden until measured, so it never flashes at the top-left corner.
          position ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        style={{
          left: position?.left ?? 0,
          top: position?.top ?? 0,
          minWidth: minWidth ?? 180,
          maxWidth: 360,
        }}
      >
        {swatches && swatches.length > 0 ? (
          <>
            <div role="group" aria-label="Colour" className="flex gap-1.5 px-2 pt-1.5 pb-1">
              {swatches.map((swatch) => (
                <button
                  key={swatch.id}
                  type="button"
                  aria-label={swatch.label}
                  aria-pressed={swatch.selected}
                  onClick={() => close(swatch.id)}
                  style={{ backgroundColor: swatch.color }}
                  className={cn(
                    "size-[17px] rounded-md transition-transform hover:scale-110",
                    swatch.selected && "ring-2 ring-offset-2 ring-offset-popover ring-current",
                  )}
                />
              ))}
            </div>
            <div className="my-1 h-px bg-border" />
          </>
        ) : null}
        {items.map((item, index) => (
          <div key={item.id} className="contents">
            {item.groupLabel && (
              <div className="px-2 pt-1.5 pb-0.5 text-ui-micro font-medium text-muted-foreground">
                {item.groupLabel}
              </div>
            )}
            {item.separatorBefore && index > 0 && <div className="my-1 h-px bg-border" />}
            <MenuRow
              item={item}
              active={index === activeIndex}
              onHover={() => setActiveIndex(item.disabled ? -1 : index)}
              onChoose={() => close(item.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
