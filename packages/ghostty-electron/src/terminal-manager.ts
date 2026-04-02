import { loadNativeAddon, type GhosttyNativeBridge } from "./native";
import type {
  CreateSurfaceOptions,
  GhosttyEventName,
  GhosttyEvents,
  ReservedShortcut,
  TerminalBounds,
} from "./types";

/**
 * Configuration for initializing the GhosttyTerminal.
 */
export interface GhosttyTerminalConfig {
  /** The Electron BrowserWindow native handle (from window.getNativeWindowHandle()). */
  windowHandle: Buffer;
  /**
   * Absolute path to the compiled ghostty_bridge.node native addon.
   * Required because bundlers (vite, webpack) can't resolve native
   * addon paths after inlining the package.
   */
  nativeAddonPath: string;
}

/**
 * GhosttyTerminal — manages Ghostty terminal surfaces within an Electron window.
 *
 * This is the main public API for the ghostty-electron package.
 * It provides a callback-based event system for receiving terminal events
 * and methods for managing terminal surface lifecycle.
 *
 * Shell integration env vars (ZDOTDIR, PROMPT_COMMAND, XDG_DATA_DIRS) are
 * the responsibility of the consuming application — pass them via
 * `createSurface(id, { envVars })`.
 */
export class GhosttyTerminal {
  private bridge: GhosttyNativeBridge | null = null;
  private activeSurfaces = new Set<string>();
  private listeners = new Map<string, Set<(...args: any[]) => void>>();

  /**
   * Initialize the Ghostty bridge with the given Electron window.
   */
  init(config: GhosttyTerminalConfig): void {
    this.bridge = loadNativeAddon(config.nativeAddonPath);
    this.bridge.init(config.windowHandle);

    // Register native callbacks that forward to the event system
    this.bridge.setCallback("title-changed", (surfaceId: unknown, title: unknown) => {
      if (typeof surfaceId === "string" && typeof title === "string") {
        this.emit("title-changed", surfaceId, title);
      }
    });

    this.bridge.setCallback("surface-closed", (surfaceId: unknown) => {
      if (typeof surfaceId === "string") {
        this.bridge?.destroySurface(surfaceId);
        this.activeSurfaces.delete(surfaceId);
        this.emit("surface-closed", surfaceId);
      }
    });

    this.bridge.setCallback("surface-focused", (surfaceId: unknown) => {
      if (typeof surfaceId === "string") {
        this.emit("surface-focused", surfaceId);
      }
    });

    this.bridge.setCallback("modifier-changed", (modifier: unknown) => {
      if (modifier === "command" || modifier === "control" || modifier === null) {
        this.emit("modifier-changed", modifier);
      }
    });

    this.bridge.setCallback("pwd-changed", (surfaceId: unknown, pwd: unknown) => {
      if (typeof surfaceId === "string" && typeof pwd === "string") {
        this.emit("pwd-changed", surfaceId, pwd);
      }
    });

    this.bridge.setCallback("notification", (surfaceId: unknown, title: unknown, body: unknown) => {
      if (typeof surfaceId === "string" && typeof title === "string" && typeof body === "string") {
        this.emit("notification", surfaceId, title, body);
      }
    });

    this.bridge.setCallback("search-start", (surfaceId: unknown, needle: unknown) => {
      if (typeof surfaceId === "string" && typeof needle === "string") {
        this.emit("search-start", surfaceId, needle);
      }
    });

    this.bridge.setCallback("search-end", (surfaceId: unknown) => {
      if (typeof surfaceId === "string") {
        this.emit("search-end", surfaceId);
      }
    });

    this.bridge.setCallback("search-total", (surfaceId: unknown, total: unknown) => {
      if (typeof surfaceId === "string" && typeof total === "number") {
        this.emit("search-total", surfaceId, total);
      }
    });

    this.bridge.setCallback("search-selected", (surfaceId: unknown, selected: unknown) => {
      if (typeof surfaceId === "string" && typeof selected === "number") {
        this.emit("search-selected", surfaceId, selected);
      }
    });
  }

  /**
   * Register an event listener.
   */
  on<E extends GhosttyEventName>(event: E, listener: GhosttyEvents[E]): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  /**
   * Remove an event listener.
   */
  off<E extends GhosttyEventName>(event: E, listener: GhosttyEvents[E]): void {
    this.listeners.get(event)?.delete(listener);
  }

  private emit(event: string, ...args: unknown[]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(...args);
      } catch (error) {
        console.error(`[ghostty-electron] listener for ${event} threw`, error);
      }
    }
  }

  /**
   * Create a new terminal surface.
   *
   * Shell integration env vars should be passed via `options.envVars`
   * by the consuming application.
   */
  createSurface(surfaceId: string, options?: CreateSurfaceOptions): void {
    if (!this.bridge) return;
    this.activeSurfaces.add(surfaceId);
    this.bridge.createSurface(surfaceId, options);
  }

  /**
   * Destroy a terminal surface.
   */
  destroySurface(surfaceId: string): void {
    if (!this.bridge) return;
    this.activeSurfaces.delete(surfaceId);
    this.bridge.destroySurface(surfaceId);
  }

  /**
   * Show a terminal surface (make it visible).
   */
  showSurface(surfaceId: string): void {
    if (!this.bridge) return;
    this.bridge.showSurface(surfaceId);
  }

  /**
   * Hide a terminal surface.
   */
  hideSurface(surfaceId: string): void {
    if (!this.bridge) return;
    this.bridge.hideSurface(surfaceId);
  }

  /**
   * Focus a terminal surface for keyboard input.
   */
  focusSurface(surfaceId: string): void {
    if (!this.bridge) return;
    this.bridge.focusSurface(surfaceId);
  }

  /**
   * Set the position and size of a terminal surface.
   */
  setBounds(surfaceId: string, bounds: TerminalBounds): void {
    if (!this.bridge) return;
    this.bridge.resizeSurface(surfaceId, bounds.x, bounds.y, bounds.width, bounds.height);
  }

  /**
   * Set which surfaces are currently visible.
   */
  setVisibleSurfaces(surfaceIds: string[]): void {
    if (!this.bridge) return;
    this.bridge.setVisibleSurfaces(surfaceIds);
  }

  /**
   * Remove keyboard focus from all surfaces.
   */
  blurSurfaces(): void {
    if (!this.bridge) return;
    this.bridge.blurSurfaces();
  }

  /**
   * Send a Ghostty binding action to a surface (e.g. "increase_font_size:1").
   */
  sendBindingAction(surfaceId: string, action: string): boolean {
    if (!this.bridge) return false;
    return this.bridge.sendBindingAction(surfaceId, action);
  }

  /**
   * Set the list of reserved shortcuts that Ghostty should not consume.
   */
  setReservedShortcuts(shortcuts: ReservedShortcut[]): void {
    if (!this.bridge) return;
    this.bridge.setReservedShortcuts(shortcuts);
  }

  /**
   * Destroy all active surfaces and clean up.
   */
  destroy(): void {
    if (!this.bridge) return;
    for (const surfaceId of this.activeSurfaces) {
      this.bridge.destroySurface(surfaceId);
    }
    this.activeSurfaces.clear();
    this.listeners.clear();
    this.bridge.shutdown();
    this.bridge = null;
  }
}
