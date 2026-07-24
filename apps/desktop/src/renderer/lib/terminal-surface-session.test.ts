import { beforeEach, expect, test, vi } from "vitest";
import {
  hasCreatedTerminalSurface,
  markTerminalSurfaceActive,
  markTerminalSurfaceCreated,
  markTerminalSurfaceInactive,
  markTerminalSurfaceReady,
  MAX_INACTIVE_PERSISTENT_TERMINAL_SURFACES,
  resetTrackedTerminalSurfacesForTests,
} from "./terminal-surface-session";

beforeEach(() => {
  resetTrackedTerminalSurfacesForTests();
});

test("bounds inactive managed surfaces without destroying their sessions", () => {
  const destroySurface = vi.fn();
  const surfaceCount = MAX_INACTIVE_PERSISTENT_TERMINAL_SURFACES + 3;

  for (let index = 0; index < surfaceCount; index++) {
    const surfaceId = `managed-${index}`;
    markTerminalSurfaceCreated(surfaceId, "managed-tmux");
    markTerminalSurfaceReady(surfaceId, destroySurface);
    markTerminalSurfaceInactive(surfaceId, destroySurface);
  }

  expect(destroySurface).toHaveBeenCalledTimes(3);
  expect(destroySurface).toHaveBeenNthCalledWith(1, "managed-0");
  expect(destroySurface).toHaveBeenNthCalledWith(2, "managed-1");
  expect(destroySurface).toHaveBeenNthCalledWith(3, "managed-2");
  expect(hasCreatedTerminalSurface("managed-0")).toBe(false);
  expect(hasCreatedTerminalSurface(`managed-${surfaceCount - 1}`)).toBe(true);
});

test("never automatically evicts direct PTY surfaces", () => {
  const destroySurface = vi.fn();

  for (let index = 0; index < MAX_INACTIVE_PERSISTENT_TERMINAL_SURFACES + 10; index++) {
    const surfaceId = `direct-${index}`;
    markTerminalSurfaceCreated(surfaceId, "direct");
    markTerminalSurfaceReady(surfaceId, destroySurface);
    markTerminalSurfaceInactive(surfaceId, destroySurface);
  }

  expect(destroySurface).not.toHaveBeenCalled();
});

test("active managed surfaces stay attached while older inactive clients are evicted", () => {
  const destroySurface = vi.fn();
  markTerminalSurfaceCreated("active", "managed-tmux");
  markTerminalSurfaceReady("active", destroySurface);

  for (let index = 0; index <= MAX_INACTIVE_PERSISTENT_TERMINAL_SURFACES; index++) {
    const surfaceId = `inactive-${index}`;
    markTerminalSurfaceCreated(surfaceId, "managed-tmux");
    markTerminalSurfaceReady(surfaceId, destroySurface);
    markTerminalSurfaceInactive(surfaceId, destroySurface);
  }
  markTerminalSurfaceActive("active");

  expect(destroySurface).toHaveBeenCalledWith("inactive-0");
  expect(destroySurface).not.toHaveBeenCalledWith("active");
  expect(hasCreatedTerminalSurface("active")).toBe(true);
});

test("pending surface creation is not evicted before it can be cancelled safely", () => {
  const destroySurface = vi.fn();
  markTerminalSurfaceCreated("pending", "managed-tmux");
  markTerminalSurfaceInactive("pending", destroySurface);

  expect(destroySurface).not.toHaveBeenCalled();
  expect(hasCreatedTerminalSurface("pending")).toBe(true);
});
