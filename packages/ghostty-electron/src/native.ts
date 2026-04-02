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

const REQUIRED_BRIDGE_METHODS = [
  "init",
  "shutdown",
  "createSurface",
  "destroySurface",
  "showSurface",
  "hideSurface",
  "focusSurface",
  "resizeSurface",
  "setVisibleSurfaces",
  "blurSurfaces",
  "sendBindingAction",
  "setReservedShortcuts",
  "setCallback",
] as const;

function isNativeBridge(value: unknown): value is GhosttyNativeBridge {
  if (typeof value !== "object" || value === null) return false;

  return REQUIRED_BRIDGE_METHODS.every((method) => {
    return typeof (value as Record<string, unknown>)[method] === "function";
  });
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

  if (!isNativeBridge(addon)) {
    const missing = REQUIRED_BRIDGE_METHODS.filter(
      (method) => typeof (addon as Record<string, unknown> | null)?.[method] !== "function",
    );
    throw new Error(
      `Invalid Ghostty native addon at ${addonPath}: missing ${missing.join(", ") || "required bridge methods"}`,
    );
  }

  return addon;
}
