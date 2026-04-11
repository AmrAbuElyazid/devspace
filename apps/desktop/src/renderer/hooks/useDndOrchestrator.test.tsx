// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { DndHandler, DropIntent } from "../lib/dnd/types";
import { useDndOrchestrator } from "./useDndOrchestrator";

const dndMocks = vi.hoisted(() => ({
  useSensor: vi.fn((_sensor: unknown, options: unknown) => options),
  useSensors: vi.fn((...sensors: unknown[]) => sensors),
  pointerWithin: vi.fn((): unknown[] => []),
  closestCenter: vi.fn((): unknown[] => []),
  handlers: [] as DndHandler[],
}));

vi.mock("@dnd-kit/core", () => ({
  PointerSensor: {},
  useSensor: dndMocks.useSensor,
  useSensors: dndMocks.useSensors,
  pointerWithin: dndMocks.pointerWithin,
  closestCenter: dndMocks.closestCenter,
}));

vi.mock("../lib/dnd/registry", () => ({
  dndHandlers: dndMocks.handlers,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function createCollision(type: string) {
  return {
    data: {
      droppableContainer: {
        data: {
          current: { type },
        },
      },
    },
  };
}

function createGroupTabDrag() {
  return {
    type: "group-tab" as const,
    workspaceId: "workspace-1",
    groupId: "group-1",
    tabId: "tab-1",
  };
}

function createSidebarWorkspaceDrag() {
  return {
    type: "sidebar-workspace" as const,
    workspaceId: "workspace-1",
    container: "main" as const,
    parentFolderId: null,
  };
}

let latestHook: ReturnType<typeof useDndOrchestrator> | null = null;
let renderCount = 0;

function HookHarness() {
  renderCount += 1;
  latestHook = useDndOrchestrator();
  return null;
}

let container: HTMLDivElement;
let root: Root | null;

beforeEach(async () => {
  if (!globalThis.PointerEvent) {
    globalThis.PointerEvent = MouseEvent as typeof PointerEvent;
  }

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  latestHook = null;
  renderCount = 0;

  dndMocks.handlers.length = 0;
  dndMocks.useSensor.mockClear();
  dndMocks.useSensors.mockClear();
  dndMocks.pointerWithin.mockReset();
  dndMocks.pointerWithin.mockReturnValue([]);
  dndMocks.closestCenter.mockReset();
  dndMocks.closestCenter.mockReturnValue([]);

  await act(async () => {
    root?.render(<HookHarness />);
  });
});

afterEach(async () => {
  dndMocks.handlers.length = 0;

  if (root) {
    await act(async () => {
      root?.unmount();
      root = null;
    });
  }

  container.remove();
});

test("group-tab collision detection prioritizes tab targets over split and sidebar targets", async () => {
  dndMocks.handlers.push({
    id: "test-handler",
    canHandle: () => true,
    isValidTarget: () => true,
    resolveIntent: () => null,
    execute: () => false,
  });

  await act(async () => {
    latestHook?.onDragStart({
      active: { data: { current: createGroupTabDrag() } },
    } as never);
  });

  dndMocks.pointerWithin.mockReturnValue([
    createCollision("pane-drop"),
    createCollision("sidebar-workspace"),
    createCollision("group-tab"),
  ]);

  const collisions = latestHook?.collisionDetection({} as never);

  expect(collisions).toEqual([expect.objectContaining(createCollision("group-tab"))]);
  expect(dndMocks.closestCenter).not.toHaveBeenCalled();
});

test("group-tab collision detection keeps sidebar root targets when empty-space drops are the only match", async () => {
  dndMocks.handlers.push({
    id: "test-handler",
    canHandle: () => true,
    isValidTarget: () => true,
    resolveIntent: () => null,
    execute: () => false,
  });

  await act(async () => {
    latestHook?.onDragStart({
      active: { data: { current: createGroupTabDrag() } },
    } as never);
  });

  dndMocks.pointerWithin.mockReturnValue([createCollision("sidebar-root")]);

  const collisions = latestHook?.collisionDetection({} as never);

  expect(collisions).toEqual([expect.objectContaining(createCollision("sidebar-root"))]);
});

test("sidebar-workspace closest-center fallback prefers group tabs over sidebar targets", async () => {
  dndMocks.handlers.push({
    id: "test-handler",
    canHandle: () => true,
    isValidTarget: () => true,
    resolveIntent: () => null,
    execute: () => false,
  });

  await act(async () => {
    latestHook?.onDragStart({
      active: { data: { current: createSidebarWorkspaceDrag() } },
    } as never);
  });

  dndMocks.pointerWithin.mockReturnValue([]);
  dndMocks.closestCenter.mockReturnValue([
    createCollision("sidebar-root"),
    createCollision("group-tab"),
  ]);

  const collisions = latestHook?.collisionDetection({} as never);

  expect(collisions).toEqual([expect.objectContaining(createCollision("group-tab"))]);
});

test("drag end executes the latest resolved intent and clears drag state", async () => {
  const dragData = createGroupTabDrag();
  const resolvedIntent: DropIntent = {
    kind: "split-group",
    workspaceId: "workspace-1",
    sourceGroupId: "group-1",
    sourceTabId: "tab-1",
    targetGroupId: "group-2",
    side: "right",
  };

  const resolveIntent = vi.fn(() => resolvedIntent);
  const execute = vi.fn(() => true);

  dndMocks.handlers.push({
    id: "test-handler",
    canHandle: () => true,
    isValidTarget: () => true,
    resolveIntent,
    execute,
  });

  await act(async () => {
    latestHook?.onDragStart({
      active: { data: { current: dragData } },
    } as never);
  });

  await act(async () => {
    latestHook?.onDragMove({
      active: { data: { current: dragData } },
      activatorEvent: new PointerEvent("pointermove", { clientX: 40, clientY: 20 }),
      delta: { x: 5, y: 10 },
      collisions: [createCollision("pane-drop")],
    } as never);
  });

  expect(resolveIntent).toHaveBeenCalledTimes(1);
  expect(latestHook?.dropIntent).toEqual(resolvedIntent);

  await act(async () => {
    latestHook?.onDragEnd({
      active: { data: { current: dragData } },
    } as never);
  });

  expect(execute).toHaveBeenCalledWith(resolvedIntent, expect.any(Function));
  expect(latestHook?.activeDrag).toBeNull();
  expect(latestHook?.dropIntent).toBeNull();
});

test("drag move skips re-rendering when the resolved drop intent is unchanged", async () => {
  const dragData = createGroupTabDrag();
  const resolvedIntent = {
    kind: "reorder-tab" as const,
    workspaceId: "workspace-1",
    sourceGroupId: "group-1",
    sourceTabId: "tab-1",
    targetGroupId: "group-1",
    targetIndex: 1,
  };

  dndMocks.handlers.push({
    id: "test-handler",
    canHandle: () => true,
    isValidTarget: () => true,
    resolveIntent: () => ({ ...resolvedIntent }),
    execute: () => false,
  });

  await act(async () => {
    latestHook?.onDragStart({
      active: { data: { current: dragData } },
    } as never);
  });

  await act(async () => {
    latestHook?.onDragMove({
      active: { data: { current: dragData } },
      activatorEvent: new PointerEvent("pointermove", { clientX: 40, clientY: 20 }),
      delta: { x: 5, y: 10 },
      collisions: [createCollision("group-tab")],
    } as never);
  });

  expect(renderCount).toBe(3);

  await act(async () => {
    latestHook?.onDragMove({
      active: { data: { current: dragData } },
      activatorEvent: new PointerEvent("pointermove", { clientX: 45, clientY: 25 }),
      delta: { x: 5, y: 10 },
      collisions: [createCollision("group-tab")],
    } as never);
  });

  expect(latestHook?.dropIntent).toEqual(resolvedIntent);
  expect(renderCount).toBe(3);
});
