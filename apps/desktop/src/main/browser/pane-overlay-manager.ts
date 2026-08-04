import type { BaseWindow, BrowserWindow } from "electron";

import type { OverlayMenuRequest } from "../../shared/overlay";

interface PaneOverlayManagerDeps {
  getWindow: () => BaseWindow | null;
  /** Creates the transparent child window, parented to the main window. */
  createSurface: () => BrowserWindow;
  loadOverlay: (surface: BrowserWindow) => void;
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

  constructor(private readonly deps: PaneOverlayManagerDeps) {}

  async showMenu(request: OverlayMenuRequest): Promise<string | null> {
    const parent = this.deps.getWindow();
    if (!parent) return null;

    // A second menu supersedes the first; the original caller gets null so its
    // await settles rather than hanging forever.
    this.settle(null);

    const surface = this.ensureSurface();
    await this.ready;
    if (surface.isDestroyed()) return null;

    this.syncBounds();
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

  destroy(): void {
    this.settle(null);
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
      if (this.surface?.isVisible()) this.syncBounds();
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
