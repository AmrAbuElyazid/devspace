import {
  SIDEBAR_PEEK_HOT_BAND,
  SIDEBAR_PEEK_INSET,
  SIDEBAR_PEEK_LEAVE_SLOP,
} from "../shared/sidebar-peek";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Where the hover panel sits, in screen coordinates.
 *
 * The sidebar's own width and the full height of the workspace, because this
 * *is* the sidebar — laid over the panes rather than pushing them aside. It
 * starts below the title bar so the traffic lights stay visible and clickable.
 */
export function peekPanelRect(content: Rect, titleBarHeight: number, width: number): Rect {
  const top = content.y + Math.max(titleBarHeight, SIDEBAR_PEEK_INSET);
  return {
    x: content.x + SIDEBAR_PEEK_INSET,
    y: top,
    width: Math.round(width),
    height: Math.max(0, content.y + content.height - top - SIDEBAR_PEEK_INSET),
  };
}

/**
 * The strip that opens the panel.
 *
 * Starts below the title bar so that reaching for the close button, or dragging
 * the window by its chrome, never trips it.
 */
export function peekHotBand(content: Rect, titleBarHeight: number): Rect {
  const top = content.y + titleBarHeight;
  return {
    x: content.x,
    y: top,
    width: SIDEBAR_PEEK_HOT_BAND,
    height: Math.max(0, content.y + content.height - top),
  };
}

function contains(rect: Rect, point: Point, slop = 0): boolean {
  return (
    point.x >= rect.x - slop &&
    point.x <= rect.x + rect.width + slop &&
    point.y >= rect.y - slop &&
    point.y <= rect.y + rect.height + slop
  );
}

/**
 * Whether the panel should be open, given where the cursor is now.
 *
 * Deliberately asymmetric: a thin band opens it and the panel's own bounds plus
 * a margin keep it open. One rectangle for both would either be too eager to
 * open or too eager to close.
 */
export function nextPeekVisibility(args: {
  open: boolean;
  cursor: Point;
  content: Rect;
  titleBarHeight: number;
  width: number;
}): boolean {
  const { open, cursor, content, titleBarHeight, width } = args;

  if (!open) return contains(peekHotBand(content, titleBarHeight), cursor);

  // The hot band is included on purpose: the panel is inset from the window
  // edge, so the pixels the cursor arrived through are outside the panel and
  // would otherwise close it the moment it opened.
  return (
    contains(peekPanelRect(content, titleBarHeight, width), cursor, SIDEBAR_PEEK_LEAVE_SLOP) ||
    contains(peekHotBand(content, titleBarHeight), cursor)
  );
}
