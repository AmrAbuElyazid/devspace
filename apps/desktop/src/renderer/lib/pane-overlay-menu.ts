import type { OverlayMenuItem, OverlayMenuRequest } from "../../shared/overlay";

export type { OverlayMenuItem };

/**
 * Opens a menu above a pane's native view and resolves with the chosen id.
 *
 * Use this instead of a DOM popover for anything triggered from a pane's own
 * chrome: a `WebContentsView` composites above the renderer, so a normal
 * dropdown opened from a browser toolbar is painted underneath the page.
 *
 * The anchor is read from the trigger element, so call sites pass the element
 * rather than computing coordinates.
 */
export async function showPaneOverlayMenu(
  trigger: HTMLElement,
  items: OverlayMenuItem[],
  options: Pick<OverlayMenuRequest, "align" | "minWidth" | "label" | "swatches"> = {},
): Promise<string | null> {
  const rect = trigger.getBoundingClientRect();

  return window.api.overlay.showMenu({
    anchor: {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
    items,
    dark: document.documentElement.classList.contains("dark"),
    ...options,
  });
}

/**
 * Same surface, anchored to a pointer rather than an element — for context
 * menus, which open where the cursor is, not where the row is.
 */
export async function showPointerOverlayMenu(
  event: { clientX: number; clientY: number; preventDefault: () => void },
  items: OverlayMenuItem[],
  options: Pick<OverlayMenuRequest, "align" | "minWidth" | "label" | "swatches"> = {},
): Promise<string | null> {
  event.preventDefault();

  return window.api.overlay.showMenu({
    // A zero-size anchor at the cursor: the surface positions below-right of
    // it and flips at the edges, which is what a context menu should do.
    anchor: { x: Math.round(event.clientX), y: Math.round(event.clientY), width: 0, height: 0 },
    items,
    dark: document.documentElement.classList.contains("dark"),
    ...options,
  });
}
