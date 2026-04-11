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

export function destroyTrackedTerminalSurfaces(
  surfaceIds: Iterable<string>,
  destroySurface: (surfaceId: string) => void,
): string[] {
  const destroyedSurfaceIds: string[] = [];

  for (const surfaceId of surfaceIds) {
    if (!createdTerminalSurfaces.has(surfaceId)) {
      continue;
    }

    createdTerminalSurfaces.delete(surfaceId);
    destroySurface(surfaceId);
    destroyedSurfaceIds.push(surfaceId);
  }

  return destroyedSurfaceIds;
}
