/**
 * The page-zoom range a web-backed pane offers, shared by the keyboard
 * shortcuts, the toolbar buttons and the pane's own setter so all three agree
 * on the limits.
 *
 * Pinch-to-zoom is a separate layer and is deliberately not clamped here: it
 * magnifies what has already been rendered rather than laying the page out
 * again, and it lives in the guest's compositor rather than in pane config.
 */
export const MIN_BROWSER_ZOOM = 0.25;
export const MAX_BROWSER_ZOOM = 3;

/** Rounded to whole percent: the shortcut and toolbar steps move in tenths. */
export function clampBrowserZoom(zoom: number): number {
  return Math.min(MAX_BROWSER_ZOOM, Math.max(MIN_BROWSER_ZOOM, Number(zoom.toFixed(2))));
}
