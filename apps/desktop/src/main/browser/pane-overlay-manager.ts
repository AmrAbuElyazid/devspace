import type { BaseWindow, WebContentsView } from "electron";

import type { OverlayMenuRequest } from "../../shared/overlay";

interface PaneOverlayManagerDeps {
  getWindow: () => BaseWindow | null;
  createView: () => WebContentsView;
  /** Resolves the renderer entry, with the overlay hash appended. */
  loadOverlay: (view: WebContentsView) => void;
}

interface PendingMenu {
  token: number;
  resolve: (id: string | null) => void;
}

/**
 * Owns the single transparent view used to draw menus above a pane.
 *
 * One view is created lazily and reused: instantiating a WebContentsView spins
 * up a renderer process, which is far too much to pay on every menu open. It is
 * parked hidden between uses and only torn down with the window.
 *
 * The view covers the window's whole content area rather than being sized to
 * the menu. That is deliberate — a menu wants a click-outside-to-dismiss scrim,
 * and since there is no per-view `setIgnoreMouseEvents` in Electron, a
 * full-bleed view is the only thing that can catch that click. The scrim is
 * fully transparent, so the page stays visible underneath.
 */
export class PaneOverlayManager {
  private view: WebContentsView | null = null;
  private ready: Promise<void> | null = null;
  private markReady: (() => void) | null = null;
  private pending: PendingMenu | null = null;
  private nextToken = 1;

  constructor(private readonly deps: PaneOverlayManagerDeps) {}

  async showMenu(request: OverlayMenuRequest): Promise<string | null> {
    const window = this.deps.getWindow();
    if (!window) return null;

    // A second menu supersedes the first; the original caller gets null so its
    // await settles rather than hanging forever.
    this.settle(null);

    const view = this.ensureView();
    await this.ready;
    if (view.webContents.isDestroyed()) return null;

    const [width = 0, height = 0] = window.getContentSize();
    view.setBounds({ x: 0, y: 0, width, height });
    // Re-adding an attached child moves it to the top of the stack, which is
    // what keeps the overlay above panes created after it.
    window.contentView.addChildView(view);
    view.setVisible(true);

    const token = this.nextToken++;
    view.webContents.send("overlay:menu", { token, request });
    view.webContents.focus();

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
    const view = this.view;
    this.view = null;
    this.ready = null;
    if (!view) return;

    this.deps.getWindow()?.contentView.removeChildView(view);
    // WebContents attached to a BaseWindow are not torn down with it.
    if (!view.webContents.isDestroyed()) view.webContents.close();
  }

  private settle(id: string | null): void {
    const pending = this.pending;
    this.pending = null;
    if (!pending) return;

    this.hide();
    pending.resolve(id);
  }

  private hide(): void {
    const view = this.view;
    if (!view || view.webContents.isDestroyed()) return;

    view.setVisible(false);
    // Parked off-screen as well as hidden: a zero-opacity view that still
    // covers the pane would keep swallowing the pane's mouse input.
    view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  }

  private ensureView(): WebContentsView {
    const existing = this.view;
    if (existing && !existing.webContents.isDestroyed()) return existing;

    const view = this.deps.createView();
    // WebContentsView defaults to an opaque white background, unlike the
    // BrowserView it replaced. Without this the "overlay" is a white sheet.
    view.setBackgroundColor("#00000000");
    view.setVisible(false);

    // Resolved by the overlay itself once React has mounted and subscribed.
    // `did-finish-load` is too early: it fires before effects run, so the first
    // menu would be posted into a document with no listener and vanish.
    this.ready = new Promise<void>((resolve) => {
      this.markReady = resolve;
      // Never leave showMenu awaiting a load that failed outright.
      view.webContents.once("did-fail-load", () => resolve());
    });
    this.deps.loadOverlay(view);

    this.view = view;
    return view;
  }
}
