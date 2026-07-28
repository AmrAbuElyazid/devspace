/**
 * Geometry of the frameless-window title bar, shared by the main process
 * (which positions the native macOS window buttons) and the renderer (which
 * has to leave a matching hole in whatever chrome sits in the top-left).
 *
 * Keeping both sides on the same numbers is the whole point of this module:
 * the traffic lights are positioned natively and cannot be laid out by CSS,
 * so any drift between the two shows up as buttons overlapping the UI.
 */

/** Title-bar height while the sidebar is open — the sidebar header owns the top-left. */
export const TITLE_BAR_HEIGHT_EXPANDED = 48;

/** Title-bar height while the sidebar is collapsed — the tab bar owns the top-left. */
export const TITLE_BAR_HEIGHT_COMPACT = 32;

/**
 * Horizontal space the traffic lights need: 16px inset + a 52px three-button
 * cluster + 12px of breathing room before app content may start.
 */
export const TRAFFIC_LIGHT_GUTTER = 80;

/** Distance from the window's left edge to the first window button. */
export const TRAFFIC_LIGHT_INSET_X = 16;

/** Height of the native window-button cluster, used to center it vertically. */
export const TRAFFIC_LIGHT_HEIGHT = 12;

/** Guards against a renderer sending a nonsensical height over IPC. */
export const MIN_TITLE_BAR_HEIGHT = 24;
export const MAX_TITLE_BAR_HEIGHT = 96;

/** The title-bar height for a given sidebar state. */
export function titleBarHeightFor(sidebarOpen: boolean): number {
  return sidebarOpen ? TITLE_BAR_HEIGHT_EXPANDED : TITLE_BAR_HEIGHT_COMPACT;
}
