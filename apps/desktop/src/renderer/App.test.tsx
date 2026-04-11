// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { installMockWindowApi } from "./test-utils/mock-window-api";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const appMocks = vi.hoisted(() => ({
  workspaceState: {
    activeWorkspaceId: "workspace-active",
    workspaces: [
      { id: "workspace-active", root: { kind: "active-root" } },
      { id: "workspace-hidden", root: { kind: "hidden-root" } },
    ],
    openEditorTab: vi.fn(),
    sidebarTree: [],
    paneGroups: {},
  },
  settingsState: {
    settingsOpen: false,
    sidebarOpen: true,
    keepVscodeServerRunning: false,
    isOverlayActive: () => false,
  },
  setDragHidesViews: vi.fn(),
  initNativeViewSubscriptions: vi.fn(),
  useTheme: vi.fn(),
  useAppShortcuts: vi.fn(),
  useBrowserBridge: vi.fn(),
  useTerminalEvents: vi.fn(),
  useModifierHeld: vi.fn(() => null),
  splitLayoutCalls: [] as Array<{ workspaceId: string; dndEnabled: boolean; sidebarOpen: boolean }>,
  dnd: {
    sensors: [],
    collisionDetection: undefined,
    onDragStart: vi.fn(),
    onDragMove: vi.fn(),
    onDragOver: vi.fn(),
    onDragEnd: vi.fn(),
    onDragCancel: vi.fn(),
    activeDrag: null,
    dropIntent: null,
  },
}));

vi.mock("./store/workspace-store", () => ({
  useWorkspaceStore: Object.assign(
    (selector: (state: typeof appMocks.workspaceState) => unknown) =>
      selector(appMocks.workspaceState),
    {
      getState: () => appMocks.workspaceState,
    },
  ),
}));

vi.mock("./store/settings-store", () => ({
  useSettingsStore: (selector: (state: typeof appMocks.settingsState) => unknown) =>
    selector(appMocks.settingsState),
}));

vi.mock("./store/native-view-store", () => ({
  useNativeViewStore: (
    selector: (state: { setDragHidesViews: typeof appMocks.setDragHidesViews }) => unknown,
  ) => selector({ setDragHidesViews: appMocks.setDragHidesViews }),
  initNativeViewSubscriptions: appMocks.initNativeViewSubscriptions,
}));

vi.mock("./hooks/useTheme", () => ({
  useTheme: appMocks.useTheme,
}));

vi.mock("./hooks/useDndOrchestrator", () => ({
  ActiveDragContext: { Provider: ({ children }: { children: unknown }) => children },
  DropIntentContext: { Provider: ({ children }: { children: unknown }) => children },
  useDndOrchestrator: () => appMocks.dnd,
}));

vi.mock("./hooks/useModifierHeld", () => ({
  useModifierHeld: appMocks.useModifierHeld,
}));

vi.mock("./hooks/useAppShortcuts", () => ({
  useAppShortcuts: appMocks.useAppShortcuts,
}));

vi.mock("./hooks/useBrowserBridge", () => ({
  useBrowserBridge: appMocks.useBrowserBridge,
}));

vi.mock("./hooks/useTerminalEvents", () => ({
  useTerminalEvents: appMocks.useTerminalEvents,
}));

vi.mock("./components/Sidebar", () => ({
  default: () => <div data-testid="sidebar" />,
}));

vi.mock("./components/SplitLayout", () => ({
  default: ({ workspaceId, dndEnabled, sidebarOpen }: Record<string, unknown>) => {
    appMocks.splitLayoutCalls.push({
      workspaceId: workspaceId as string,
      dndEnabled: dndEnabled as boolean,
      sidebarOpen: sidebarOpen as boolean,
    });
    return <div data-testid={`workspace-${workspaceId as string}`} />;
  },
}));

vi.mock("./components/SettingsPage", () => ({
  default: () => <div data-testid="settings" />,
}));

vi.mock("./components/PanePickerDialog", () => ({
  PanePickerDialog: () => <div data-testid="pane-picker" />,
}));

vi.mock("./components/ui/toast", () => ({
  ToastViewport: () => <div data-testid="toast-viewport" />,
}));

vi.mock("./lib/sidebar-tree", () => ({
  findFolder: () => null,
}));

afterEach(() => {
  appMocks.splitLayoutCalls.length = 0;
  document.body.innerHTML = "";
});

test("App only mounts the active workspace layer", async () => {
  installMockWindowApi();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  const { default: App } = await import("./App");

  await act(async () => {
    root.render(<App />);
  });

  expect(appMocks.initNativeViewSubscriptions).toHaveBeenCalledTimes(1);
  expect(appMocks.splitLayoutCalls).toEqual([
    {
      workspaceId: "workspace-active",
      dndEnabled: true,
      sidebarOpen: true,
    },
  ]);
  expect(container.querySelector('[data-testid="workspace-workspace-active"]')).toBeTruthy();
  expect(container.querySelector('[data-testid="workspace-workspace-hidden"]')).toBeNull();

  await act(async () => {
    root.unmount();
  });
});
