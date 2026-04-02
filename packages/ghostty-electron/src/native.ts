import type { ReservedShortcut } from "./types";

/**
 * Low-level N-API interface to the Ghostty native bridge.
 * This matches the exports from ghostty_bridge.node.
 */
export interface GhosttyNativeBridge {
  init(windowHandle: Buffer): void;
  shutdown(): void;
  createSurface(
    surfaceId: string,
    options?: { cwd?: string; envVars?: Record<string, string> },
  ): void;
  destroySurface(surfaceId: string): void;
  showSurface(surfaceId: string): void;
  hideSurface(surfaceId: string): void;
  focusSurface(surfaceId: string): void;
  resizeSurface(surfaceId: string, x: number, y: number, width: number, height: number): void;
  setVisibleSurfaces(surfaceIds: string[]): void;
  blurSurfaces(): void;
  sendBindingAction(surfaceId: string, action: string): boolean;
  setReservedShortcuts(shortcuts: ReservedShortcut[]): void;
  setCallback(
    event:
      | "title-changed"
      | "surface-closed"
      | "surface-focused"
      | "modifier-changed"
      | "pwd-changed"
      | "notification"
      | "search-start"
      | "search-end"
      | "search-total"
      | "search-selected",
    callback: (...args: unknown[]) => void,
  ): void;
}

/**
 * Load the compiled native addon (.node file).
 *
 * @param addonPath - Absolute path to the ghostty_bridge.node file.
 *   Bundlers (vite, webpack) can't resolve native addon paths after
 *   inlining this package, so the consuming app must provide the path.
 */
export function loadNativeAddon(addonPath: string): GhosttyNativeBridge {
  const raw = require(addonPath);
  // Vite's ESM bundling may wrap the require result in { default: <addon> }
  const addon = raw.default ?? raw;
  return addon as GhosttyNativeBridge;
}
