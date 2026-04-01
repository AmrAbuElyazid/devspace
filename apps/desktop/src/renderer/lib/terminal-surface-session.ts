const createdTerminalSurfaces = new Set<string>();

export function hasCreatedTerminalSurface(surfaceId: string): boolean {
  return createdTerminalSurfaces.has(surfaceId);
}

export function markTerminalSurfaceCreated(surfaceId: string): void {
  createdTerminalSurfaces.add(surfaceId);
}

export function markTerminalSurfaceDestroyed(surfaceId: string): void {
  createdTerminalSurfaces.delete(surfaceId);
}
