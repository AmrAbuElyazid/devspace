import type { BaseWindow, BrowserWindow, Rectangle } from "electron";

import type { OverlayMenuRequest } from "../../shared/overlay";
import type { SidebarPeekSnapshot } from "../../shared/sidebar-peek";

interface PaneOverlayManagerDeps {
  getWindow: () => BaseWindow | null;
  /** Creates the transparent child window, parented to the main window. */
  createSurface: () => BrowserWindow;
  loadOverlay: (surface: BrowserWindow) => void;
}

function rectsEqual(left: Rectangle | null, right: Rectangle): boolean {
  return (
    left !== null &&
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

interface PendingMenu {
  token: number;
  resolve: (id: string | null) => void;
}

/**
 * Owns the single transparent surface used to draw popups above the panes.
 *
 * This is a child *window*, not a child view, and the difference is the whole
 * point. A `WebContentsView` is composited above the renderer but below the
 * terminal: Ghostty attaches its surface to the window's AppKit content view
 * with a raw `addSubview:`, which lands above Electron's entire view tree, so a
 * view-based overlay is sliced off at the terminal's edge. A child window sits
 * above every view in the parent, terminals included.
 *
 * One surface is created lazily and reused — instantiating it spins up a
 * renderer process, far too much to pay per popup. It is parked hidden between
 * uses and torn down with the parent.
 *
 * It covers the parent's whole content rect rather than being sized to the
 * popup. That is deliberate: a menu wants a click-outside-to-dismiss scrim, and
 * a full-bleed surface is the only thing that can catch that click. The scrim
 * is fully transparent, so the panes stay visible underneath.
 */
export class PaneOverlayManager {
  private surface: BrowserWindow | null = null;
  private ready: Promise<void> | null = null;
  private markReady: (() => void) | null = null;
  private pending: PendingMenu | null = null;
  private nextToken = 1;
  private followListener: (() => void) | null = null;
  private peekOpen = false;
  private peekRect: Rectangle | null = null;
  private peekSnapshot = "";
  private peekToken = 0;
  private peekContentHeight: number | null = null;

  constructor(private readonly deps: PaneOverlayManagerDeps) {}

  async showMenu(request: OverlayMenuRequest): Promise<string | null> {
    const parent = this.deps.getWindow();
    if (!parent) return null;

    // A second menu supersedes the first; the original caller gets null so its
    // await settles rather than hanging forever.
    this.settle(null);
    // A menu and the peek panel want the same surface at different sizes, so
    // the menu — which the user asked for explicitly — takes it.
    this.closePeek();

    const surface = this.ensureSurface();
    await this.ready;
    if (surface.isDestroyed()) return null;

    this.syncBounds();
    // Undoes the peek's non-focusable mode; a menu owns the keyboard.
    surface.setFocusable(true);
    surface.showInactive();
    // Raised after showing: a surface shown while another app was frontmost can
    // otherwise sit below its own parent.
    surface.moveTop();
    // A menu owns the keyboard while it is open — Escape and the arrow keys are
    // handled in the surface's own document, which never sees them otherwise.
    surface.focus();

    const token = this.nextToken++;
    surface.webContents.send("overlay:menu", { token, request });

    return new Promise<string | null>((resolve) => {
      this.pending = { token, resolve };
    });
  }

  /**
   * Show the collapsed sidebar's hover panel at `rect`, in screen coordinates.
   *
   * Sized to the panel rather than the whole content rect, unlike a menu: the
   * surface takes every mouse event inside its bounds, and a full-bleed one
   * would make the panes unclickable for as long as the panel was up.
   *
   * Never focused. The panel is a glance, and stealing the keyboard from a
   * terminal because the pointer drifted into a corner would be indefensible.
   */
  async showPeek(rect: Rectangle, snapshot: SidebarPeekSnapshot): Promise<void> {
    // A menu is modal in spirit; it keeps the surface until it settles.
    if (this.pending) return;
    const parent = this.deps.getWindow();
    if (!parent) return;

    const token = ++this.peekToken;
    const surface = this.ensureSurface();
    await this.ready;
    // The very first peek of a session is what creates the surface, so this
    // await is a whole renderer process starting — hundreds of milliseconds,
    // during which the cursor has usually moved on. Without the token that
    // hide is dropped (there is no open panel yet to take down) and the panel
    // then appears with nothing left that will ever close it.
    if (surface.isDestroyed() || this.pending || token !== this.peekToken) return;

    // Called on every watcher tick while the panel is up, so that a window move
    // or a workspace rename lands without another mechanism. Both halves are
    // deduplicated rather than resent eleven times a second.
    const serialized = JSON.stringify(snapshot);
    if (!this.peekOpen || !rectsEqual(this.peekRect, rect)) this.applyPeekBounds(rect);
    this.peekRect = rect;
    if (!this.peekOpen || serialized !== this.peekSnapshot) {
      surface.webContents.send("overlay:peek", snapshot);
      this.peekSnapshot = serialized;
    }
    if (!this.peekOpen) {
      // Non-focusable, which is what makes this a hover panel rather than a
      // window: clicking a row neither activates the surface nor blurs the
      // parent, so the terminal keeps the keyboard and — since the parent's
      // blur is what stands the watcher down — the panel survives its own
      // mouse-down long enough to see the click.
      surface.setFocusable(false);
      surface.showInactive();
      // Raised after showing: a surface shown while another app was frontmost
      // can otherwise sit below its own parent.
      surface.moveTop();
      this.peekOpen = true;
    }
  }

  hidePeek(): void {
    this.closePeek();
  }

  /**
   * The height the panel's card actually wants, measured by the overlay.
   *
   * The window opens at the full height of the workspace and is trimmed to
   * this. A card shorter than its window would otherwise leave a transparent
   * strip below it that still swallows every click aimed at the pane behind.
   */
  setPeekHeight(height: unknown): void {
    if (typeof height !== "number" || !Number.isFinite(height) || height <= 0) return;
    const rounded = Math.ceil(height);
    if (rounded === this.peekContentHeight) return;
    this.peekContentHeight = rounded;
    if (this.peekOpen && this.peekRect) this.applyPeekBounds(this.peekRect);
  }

  private applyPeekBounds(rect: Rectangle): void {
    const surface = this.surface;
    if (!surface || surface.isDestroyed()) return;
    const height = this.peekContentHeight
      ? Math.min(rect.height, this.peekContentHeight)
      : rect.height;
    surface.setBounds({ ...rect, height });
  }

  /** Called from IPC when the overlay has mounted and is listening. */
  handleOverlayReady(): void {
    this.markReady?.();
    this.markReady = null;
  }

  /** Called from IPC when the overlay reports a choice or a dismissal. */
  resolveMenu(token: unknown, id: unknown): void {
    if (typeof token !== "number") return;
    if (this.pending?.token !== token) return;
    this.settle(typeof id === "string" ? id : null);
  }

  private closePeek(): void {
    // Bumped even when nothing is open, so that a show still waiting on the
    // overlay to mount is cancelled rather than landing after the fact.
    this.peekToken += 1;
    if (!this.peekOpen) return;
    this.peekOpen = false;
    this.peekRect = null;
    this.peekSnapshot = "";
    // Forgotten rather than carried over: the next peek may hold a different
    // number of rows, and opening at a stale short height would clip it until
    // the overlay had re-measured.
    this.peekContentHeight = null;
    const surface = this.surface;
    if (surface && !surface.isDestroyed()) {
      surface.webContents.send("overlay:peek", null);
      surface.hide();
    }
    // Deliberately no `parent.focus()` here. The panel is non-focusable, so it
    // never took the keyboard and has none to hand back — and one of the ways
    // in here is the parent's own blur, where grabbing focus would pull the
    // app back in front of whatever the user just switched to.
  }

  destroy(): void {
    this.settle(null);
    this.peekOpen = false;
    this.detachFollow();

    const surface = this.surface;
    this.surface = null;
    this.ready = null;
    if (surface && !surface.isDestroyed()) surface.destroy();
  }

  private settle(id: string | null): void {
    const pending = this.pending;
    this.pending = null;
    if (!pending) return;

    this.hide();
    pending.resolve(id);
  }

  private hide(): void {
    const surface = this.surface;
    if (!surface || surface.isDestroyed()) return;

    surface.hide();
    // Hand the keyboard back, or the parent stays inert until it is clicked.
    // The renderer's own focus effects then return it to the active pane.
    const parent = this.deps.getWindow();
    if (parent && !parent.isDestroyed()) parent.focus();
  }

  /**
   * macOS keeps a child window's offset from its parent across moves, but not
   * across resizes, so the surface has to be re-fitted while it is open.
   */
  private syncBounds(): void {
    const parent = this.deps.getWindow();
    const surface = this.surface;
    if (!parent || parent.isDestroyed() || !surface || surface.isDestroyed()) return;

    surface.setBounds(parent.getContentBounds());
  }

  private attachFollow(parent: BaseWindow): void {
    if (this.followListener) return;

    const onResize = (): void => {
      // Only a menu is sized to the window; the peek panel is re-placed by its
      // own watcher, which knows the rect it wants.
      if (this.pending && this.surface?.isVisible()) this.syncBounds();
    };
    parent.on("resize", onResize);
    this.followListener = () => parent.off("resize", onResize);
  }

  private detachFollow(): void {
    this.followListener?.();
    this.followListener = null;
  }

  private ensureSurface(): BrowserWindow {
    const existing = this.surface;
    if (existing && !existing.isDestroyed()) return existing;

    const surface = this.deps.createSurface();

    // Resolved by the overlay itself once React has mounted and subscribed.
    // `did-finish-load` is too early: it fires before effects run, so the first
    // menu would be posted into a document with no listener and vanish.
    this.ready = new Promise<void>((resolve) => {
      this.markReady = resolve;
      // Never leave showMenu awaiting a load that failed outright.
      surface.webContents.once("did-fail-load", () => resolve());
    });
    this.deps.loadOverlay(surface);

    const parent = this.deps.getWindow();
    if (parent) this.attachFollow(parent);

    this.surface = surface;
    return surface;
  }
}
