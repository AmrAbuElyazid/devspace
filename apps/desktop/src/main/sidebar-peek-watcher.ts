import type { SidebarPeekConfig } from "../shared/sidebar-peek";
import { nextPeekVisibility, peekPanelRect, type Point, type Rect } from "./sidebar-peek-geometry";

interface SidebarPeekWatcherDeps {
  /** Content rect in screen coordinates, or null if there is no window. */
  getContentBounds: () => Rect | null;
  getCursorPoint: () => Point;
  /** Whether the window currently has the keyboard. */
  isWindowFocused: () => boolean;
  show: (rect: Rect, config: SidebarPeekConfig) => void;
  hide: () => void;
}

/**
 * How often the cursor is sampled while the sidebar is collapsed.
 *
 * The collapsed sidebar leaves the renderer a couple of pixels of window it can
 * still see mouse events in; everything else belongs to a native pane, which
 * swallows them. So the hover has to be watched from outside, and the only
 * thing outside that knows where the pointer is, is the main process.
 *
 * `screen.getCursorScreenPoint()` measures at about 1.4µs, so eleven samples a
 * second is not a cost worth optimising — and the polling only runs while the
 * sidebar is collapsed *and* the window is focused, which is the only time the
 * answer could matter.
 */
const PEEK_POLL_INTERVAL_MS = 90;

/**
 * Opens and closes the collapsed sidebar's hover panel.
 *
 * All of the open/close authority lives here rather than being split with the
 * panel's own mouse events: two sources racing over one boolean is how a panel
 * ends up stuck open after the pointer has gone.
 */
export class SidebarPeekWatcher {
  private config: SidebarPeekConfig | null = null;
  private timer: NodeJS.Timeout | null = null;
  private open = false;
  /** Set while a menu owns the overlay surface, so the two never fight over it. */
  private suspended = false;

  constructor(private readonly deps: SidebarPeekWatcherDeps) {}

  /** The renderer's latest word on whether to watch, and what to draw. */
  setConfig(config: SidebarPeekConfig): void {
    this.config = config;
    if (!config.enabled) {
      this.close();
      this.stopPolling();
      return;
    }
    if (this.open) this.pushBounds();
    this.startPolling();
  }

  /** Called when the window's focus changes; polling is pointless while blurred. */
  setWindowFocused(focused: boolean): void {
    if (focused) {
      this.startPolling();
      return;
    }
    this.close();
    this.stopPolling();
  }

  /**
   * Shut the panel now, without waiting for the cursor to move away.
   *
   * Used when a click in the panel has been acted on: leaving it open over the
   * workspace the user just switched to would hide the thing they asked for.
   */
  dismiss(): void {
    this.close();
  }

  /** Held down while something else needs the overlay surface. */
  suspend(): void {
    this.suspended = true;
    this.close();
  }

  resume(): void {
    this.suspended = false;
  }

  dispose(): void {
    this.stopPolling();
    this.open = false;
    this.config = null;
  }

  /** Exposed for tests; the timer calls this. */
  tick(): void {
    if (this.suspended) return;
    const config = this.config;
    if (!config?.enabled) return;

    const content = this.deps.getContentBounds();
    if (!content) {
      this.close();
      return;
    }

    const shouldOpen = nextPeekVisibility({
      open: this.open,
      cursor: this.deps.getCursorPoint(),
      content,
      titleBarHeight: config.titleBarHeight,
    });

    if (!shouldOpen) {
      this.close();
      return;
    }

    // Pushed on every tick, not only on the opening one: the window can be
    // moved or resized, and a workspace renamed, while the panel is up. The
    // overlay drops a push that changes nothing.
    this.open = true;
    this.pushBounds();
  }

  private pushBounds(): void {
    const config = this.config;
    const content = this.deps.getContentBounds();
    if (!config || !content) return;
    // Recomputed on every push rather than cached: the window can be moved or
    // resized while the panel is open.
    this.deps.show(peekPanelRect(content, config.titleBarHeight), config);
  }

  private close(): void {
    if (!this.open) return;
    this.open = false;
    this.deps.hide();
  }

  private startPolling(): void {
    if (this.timer || !this.config?.enabled || !this.deps.isWindowFocused()) return;
    this.timer = setInterval(() => this.tick(), PEEK_POLL_INTERVAL_MS);
    // Background upkeep should never be the reason the process stays alive.
    this.timer.unref?.();
  }

  private stopPolling(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}
