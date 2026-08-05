/**
 * Menus rendered into a transparent view stacked above a pane's native view.
 *
 * A `WebContentsView` is composited above the renderer, so a menu opened from a
 * pane toolbar is painted underneath the page and never seen. The alternative
 * used to be hiding the pane's view for as long as the menu was open, which
 * blanked the page the user was reading. Instead the menu is rendered into its
 * own transparent view placed above the pane, so the page stays visible.
 *
 * The descriptor has to survive IPC, so it is data rather than React nodes.
 */

export interface OverlayMenuItem {
  id: string;
  label: string;
  /** Right-aligned accelerator hint, e.g. "⌘F". */
  shortcut?: string;
  /** Right-aligned muted detail, e.g. a preset's "430×932". */
  detail?: string;
  disabled?: boolean;
  /** Draw a divider above this item. Ignored on the first item. */
  separatorBefore?: boolean;
  /** Renders a group heading above this item. */
  groupLabel?: string;
  /** Shows a check against the item, for single-select menus. */
  checked?: boolean;
}

/** A single-click colour choice rendered as a row of chips above the items. */
export interface OverlaySwatch {
  id: string;
  /** Any CSS colour, including a `var(--…)` the overlay document also defines. */
  color: string;
  selected?: boolean;
  label: string;
}

export interface OverlayMenuRequest {
  /**
   * Trigger rect in renderer viewport coordinates. The renderer fills the
   * window's content area, so these are also window content coordinates and
   * need no translation.
   */
  anchor: { x: number; y: number; width: number; height: number };
  items: OverlayMenuItem[];
  /**
   * Colour chips shown above the items. A submenu or a dialog would both take
   * more clicks than the choice is worth, and a native menu cannot draw them
   * at all — which is why this menu is rendered rather than an NSMenu.
   */
  swatches?: OverlaySwatch[];
  /** Which edge of the anchor the menu aligns to. Defaults to "start". */
  align?: "start" | "end";
  minWidth?: number;
  /** Accessible name for the menu. */
  label?: string;
  /**
   * The app's current theme. The overlay is a separate document and does not
   * observe the main renderer's `.dark` class, so it has to be told.
   */
  dark?: boolean;
}

export function isOverlayMenuRequest(value: unknown): value is OverlayMenuRequest {
  if (typeof value !== "object" || value === null) return false;
  const request = value as Partial<OverlayMenuRequest>;

  const anchor = request.anchor;
  if (typeof anchor !== "object" || anchor === null) return false;
  for (const key of ["x", "y", "width", "height"] as const) {
    if (typeof anchor[key] !== "number" || !Number.isFinite(anchor[key])) return false;
  }

  if (request.swatches !== undefined) {
    if (!Array.isArray(request.swatches)) return false;
    const valid = request.swatches.every(
      (swatch) =>
        typeof swatch === "object" &&
        swatch !== null &&
        typeof (swatch as OverlaySwatch).id === "string" &&
        typeof (swatch as OverlaySwatch).color === "string" &&
        typeof (swatch as OverlaySwatch).label === "string",
    );
    if (!valid) return false;
  }

  if (!Array.isArray(request.items) || request.items.length === 0) return false;
  return request.items.every(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as OverlayMenuItem).id === "string" &&
      typeof (item as OverlayMenuItem).label === "string",
  );
}
