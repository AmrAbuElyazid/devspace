import {
  MAX_TITLE_BAR_HEIGHT,
  MIN_TITLE_BAR_HEIGHT,
  TITLE_BAR_HEIGHT_EXPANDED,
  TRAFFIC_LIGHT_HEIGHT,
  TRAFFIC_LIGHT_INSET_X,
} from "../shared/chrome";

/** Fallback used before the renderer has reported its chrome layout. */
export const DEFAULT_TITLE_BAR_HEIGHT = TITLE_BAR_HEIGHT_EXPANDED;

/**
 * Vertically centers the native window buttons inside whichever bar currently
 * occupies the top-left of the window. The renderer reports that bar's height;
 * anything outside the sane range is clamped rather than trusted.
 */
export function getTrafficLightPosition(titleBarHeight: number): { x: number; y: number } {
  const height = Number.isFinite(titleBarHeight)
    ? Math.min(MAX_TITLE_BAR_HEIGHT, Math.max(MIN_TITLE_BAR_HEIGHT, titleBarHeight))
    : DEFAULT_TITLE_BAR_HEIGHT;
  return {
    x: TRAFFIC_LIGHT_INSET_X,
    y: Math.round((height - TRAFFIC_LIGHT_HEIGHT) / 2),
  };
}
