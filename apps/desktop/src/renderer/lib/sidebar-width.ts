/**
 * The one clamp for the sidebar's width.
 *
 * It lived in two places — the divider's live preview allowed 180–420 while
 * the store committed 160–400 — so dragging past 400 tracked the cursor and
 * then snapped back twenty pixels on release.
 */
export function clampSidebarWidth(width: number): number {
  return Math.max(180, Math.min(420, width));
}
