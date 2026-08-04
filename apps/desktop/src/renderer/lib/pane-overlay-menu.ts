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
  options: Pick<OverlayMenuRequest, "align" | "minWidth" | "label"> = {},
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
