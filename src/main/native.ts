export interface TerminalBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GhosttyBridge {
  init(windowHandle: Buffer): void;
  createSurface(surfaceId: string): void;
  destroySurface(surfaceId: string): void;
  showSurface(surfaceId: string): void;
  hideSurface(surfaceId: string): void;
  focusSurface(surfaceId: string): void;
  resizeSurface(surfaceId: string, x: number, y: number, width: number, height: number): void;
  setVisibleSurfaces(surfaceIds: string[]): void;
  blurSurfaces(): void;
  setCallback(event: string, callback: (...args: unknown[]) => void): void;
}

export function loadNativeAddon(): GhosttyBridge {
  const raw = require("../../native/build/Release/ghostty_bridge.node");
  // Vite's ESM bundling may wrap the require result in { default: <addon> }
  const addon = raw.default ?? raw;
  return addon as GhosttyBridge;
}
