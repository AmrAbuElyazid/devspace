import type { BrowserWindow } from "electron";
import {
  loadNativeAddon,
  type GhosttyBridge,
  type NativeBridgeShortcut,
  type TerminalBounds,
} from "./native";

type TerminalCallback = {
  onTitleChanged?: (surfaceId: string, title: string) => void;
  onSurfaceClosed?: (surfaceId: string) => void;
  onSurfaceFocused?: (surfaceId: string) => void;
  onPwdChanged?: (surfaceId: string, pwd: string) => void;
  onNotification?: (surfaceId: string, title: string, body: string) => void;
};

export class TerminalManager {
  private bridge: GhosttyBridge | null = null;
  private callbacks: TerminalCallback = {};
  private activeSurfaces = new Set<string>();

  init(mainWindow: BrowserWindow): void {
    this.bridge = loadNativeAddon();
    const handle = mainWindow.getNativeWindowHandle();
    this.bridge.init(handle);

    this.bridge.setCallback("title-changed", (surfaceId: unknown, title: unknown) => {
      if (typeof surfaceId === "string" && typeof title === "string") {
        this.callbacks.onTitleChanged?.(surfaceId, title);
      }
    });

    this.bridge.setCallback("surface-closed", (surfaceId: unknown) => {
      if (typeof surfaceId === "string") {
        this.activeSurfaces.delete(surfaceId);
        this.callbacks.onSurfaceClosed?.(surfaceId);
      }
    });

    this.bridge.setCallback("surface-focused", (surfaceId: unknown) => {
      if (typeof surfaceId === "string") {
        this.callbacks.onSurfaceFocused?.(surfaceId);
      }
    });

    this.bridge.setCallback("pwd-changed", (surfaceId: unknown, pwd: unknown) => {
      if (typeof surfaceId === "string" && typeof pwd === "string") {
        this.callbacks.onPwdChanged?.(surfaceId, pwd);
      }
    });

    this.bridge.setCallback("notification", (surfaceId: unknown, title: unknown, body: unknown) => {
      if (typeof surfaceId === "string" && typeof title === "string" && typeof body === "string") {
        this.callbacks.onNotification?.(surfaceId, title, body);
      }
    });
  }

  onTitleChanged(callback: (surfaceId: string, title: string) => void): void {
    this.callbacks.onTitleChanged = callback;
  }

  onSurfaceClosed(callback: (surfaceId: string) => void): void {
    this.callbacks.onSurfaceClosed = callback;
  }

  onSurfaceFocused(callback: (surfaceId: string) => void): void {
    this.callbacks.onSurfaceFocused = callback;
  }

  onPwdChanged(callback: (surfaceId: string, pwd: string) => void): void {
    this.callbacks.onPwdChanged = callback;
  }

  onNotification(callback: (surfaceId: string, title: string, body: string) => void): void {
    this.callbacks.onNotification = callback;
  }

  createSurface(surfaceId: string, options?: { cwd?: string }): void {
    if (!this.bridge) return;
    this.activeSurfaces.add(surfaceId);
    this.bridge.createSurface(surfaceId, options);
  }

  destroySurface(surfaceId: string): void {
    if (!this.bridge) return;
    this.activeSurfaces.delete(surfaceId);
    this.bridge.destroySurface(surfaceId);
  }

  showSurface(surfaceId: string): void {
    if (!this.bridge) return;
    this.bridge.showSurface(surfaceId);
  }

  hideSurface(surfaceId: string): void {
    if (!this.bridge) return;
    this.bridge.hideSurface(surfaceId);
  }

  focusSurface(surfaceId: string): void {
    if (!this.bridge) return;
    this.bridge.focusSurface(surfaceId);
  }

  setVisibleSurfaces(surfaceIds: string[]): void {
    if (!this.bridge) return;
    this.bridge.setVisibleSurfaces(surfaceIds);
  }

  setBounds(surfaceId: string, bounds: TerminalBounds): void {
    if (!this.bridge) return;
    this.bridge.resizeSurface(surfaceId, bounds.x, bounds.y, bounds.width, bounds.height);
  }

  blurSurfaces(): void {
    if (!this.bridge) return;
    this.bridge.blurSurfaces();
  }

  /** Send a Ghostty binding action to a surface (e.g. "increase_font_size:1"). */
  sendBindingAction(surfaceId: string, action: string): boolean {
    if (!this.bridge) return false;
    return this.bridge.sendBindingAction(surfaceId, action);
  }

  /** Sync the reserved shortcuts list to the native bridge. */
  setReservedShortcuts(shortcuts: NativeBridgeShortcut[]): void {
    if (!this.bridge) return;
    this.bridge.setReservedShortcuts(shortcuts);
  }

  destroyAll(): void {
    if (!this.bridge) return;
    for (const surfaceId of this.activeSurfaces) {
      this.bridge.destroySurface(surfaceId);
    }
    this.activeSurfaces.clear();
  }
}
