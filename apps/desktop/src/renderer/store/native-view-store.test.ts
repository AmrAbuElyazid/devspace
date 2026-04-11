// @vitest-environment jsdom

import { beforeEach, expect, test, vi } from "vitest";
import * as splitTree from "../lib/split-tree";
import { useSettingsStore } from "./settings-store";
import { installMockWindowApi } from "../test-utils/mock-window-api";
import {
  getNativeViewProfilingSnapshot,
  initNativeViewSubscriptions,
  recordNativeFocusRequest,
  resetNativeViewProfilingCounters,
  setNativeViewElement,
  updateNativeViewBounds,
  useNativeViewStore,
} from "./native-view-store";
import { useWorkspaceStore } from "./workspace-store";

beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as typeof ResizeObserver;
  globalThis.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  globalThis.cancelAnimationFrame = vi.fn();

  installMockWindowApi({
    terminal: {
      setBounds: vi.fn(),
      setVisibleSurfaces: vi.fn(),
      blur: vi.fn(),
    },
    browser: {
      setBounds: vi.fn(),
      setVisiblePanes: vi.fn(),
    },
  });

  resetNativeViewProfilingCounters();
  useNativeViewStore.setState({
    views: {},
    visibleTerminals: [],
    visibleBrowsers: [],
    dragHidesViews: false,
  });
  setNativeViewElement("terminal-1", null);
  setNativeViewElement("browser-1", null);
  useWorkspaceStore.setState({
    activeWorkspaceId: "",
    workspaces: [],
    paneGroups: {},
  });
  useSettingsStore.setState({ settingsOpen: false, overlayCount: 0 });
});

test("profiles native view registration, bounds sync, and focus requests", () => {
  useNativeViewStore.getState().register("terminal-1", "terminal");
  useNativeViewStore.getState().register("browser-1", "browser");

  useNativeViewStore.setState({
    visibleTerminals: ["terminal-1"],
    visibleBrowsers: ["browser-1"],
  });

  updateNativeViewBounds("terminal-1", { x: 10, y: 20, width: 300, height: 200 });
  updateNativeViewBounds("browser-1", { x: 30, y: 40, width: 500, height: 320 });
  recordNativeFocusRequest("terminal");
  recordNativeFocusRequest("browser");
  const visibleSnapshot = getNativeViewProfilingSnapshot();
  useNativeViewStore.getState().unregister("browser-1");

  const snapshot = getNativeViewProfilingSnapshot();

  expect(visibleSnapshot.visible).toEqual({ total: 2, terminals: 1, browsers: 1 });
  expect(snapshot.registered).toEqual({ total: 1, terminals: 1, browsers: 0 });
  expect(snapshot.visible).toEqual({ total: 0, terminals: 0, browsers: 0 });
  expect(snapshot.counters).toMatchObject({
    registerCalls: 2,
    unregisterCalls: 1,
    reconcileCalls: 3,
    boundsSyncCalls: 2,
    focusRequests: 2,
    terminalFocusRequests: 1,
    browserFocusRequests: 1,
  });
  expect(window.api.terminal.setBounds).toHaveBeenCalledWith("terminal-1", {
    x: 10,
    y: 20,
    width: 300,
    height: 200,
  });
  expect(window.api.browser.setBounds).toHaveBeenCalledWith("browser-1", {
    x: 30,
    y: 40,
    width: 500,
    height: 320,
  });
});

test("resetNativeViewProfilingCounters clears accumulated counts", () => {
  useNativeViewStore.getState().register("terminal-1", "terminal");
  recordNativeFocusRequest("terminal");

  resetNativeViewProfilingCounters();

  expect(getNativeViewProfilingSnapshot().counters).toEqual({
    registerCalls: 0,
    unregisterCalls: 0,
    reconcileCalls: 0,
    visibleBoundsSyncPasses: 0,
    boundsSyncCalls: 0,
    focusRequests: 0,
    terminalFocusRequests: 0,
    browserFocusRequests: 0,
  });
});

test("reconcile detaches idle layout listeners when no native views remain visible", () => {
  const addEventListener = vi.spyOn(window, "addEventListener");
  const removeEventListener = vi.spyOn(window, "removeEventListener");
  const element = document.createElement("div");

  useWorkspaceStore.setState({
    activeWorkspaceId: "workspace-1",
    workspaces: [
      {
        id: "workspace-1",
        name: "Workspace",
        root: { type: "leaf", groupId: "group-1" },
        focusedGroupId: "group-1",
        zoomedGroupId: null,
        lastActiveAt: Date.now(),
      },
    ],
    paneGroups: {
      "group-1": {
        id: "group-1",
        activeTabId: "tab-1",
        tabs: [{ id: "tab-1", paneId: "terminal-1" }],
      },
    },
  });

  useNativeViewStore.getState().register("terminal-1", "terminal");
  setNativeViewElement("terminal-1", element);
  useNativeViewStore.getState().reconcile();

  expect(addEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
  expect(addEventListener).toHaveBeenCalledWith("scroll", expect.any(Function), true);

  useSettingsStore.setState({ overlayCount: 1 });
  useNativeViewStore.getState().reconcile();

  expect(removeEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
  expect(removeEventListener).toHaveBeenCalledWith("scroll", expect.any(Function), true);
});

test("reconcile does not attach layout listeners before a visible native view has an element", () => {
  const addEventListener = vi.spyOn(window, "addEventListener");

  useWorkspaceStore.setState({
    activeWorkspaceId: "workspace-1",
    workspaces: [
      {
        id: "workspace-1",
        name: "Workspace",
        root: { type: "leaf", groupId: "group-1" },
        focusedGroupId: "group-1",
        zoomedGroupId: null,
        lastActiveAt: Date.now(),
      },
    ],
    paneGroups: {
      "group-1": {
        id: "group-1",
        activeTabId: "tab-1",
        tabs: [{ id: "tab-1", paneId: "terminal-1" }],
      },
    },
  });

  useNativeViewStore.getState().register("terminal-1", "terminal");
  useNativeViewStore.getState().reconcile();

  expect(addEventListener).not.toHaveBeenCalledWith("resize", expect.any(Function));
  expect(addEventListener).not.toHaveBeenCalledWith("scroll", expect.any(Function), true);
});

test("removing the last observed native view element detaches layout listeners", () => {
  const removeEventListener = vi.spyOn(window, "removeEventListener");
  const element = document.createElement("div");

  useWorkspaceStore.setState({
    activeWorkspaceId: "workspace-1",
    workspaces: [
      {
        id: "workspace-1",
        name: "Workspace",
        root: { type: "leaf", groupId: "group-1" },
        focusedGroupId: "group-1",
        zoomedGroupId: null,
        lastActiveAt: Date.now(),
      },
    ],
    paneGroups: {
      "group-1": {
        id: "group-1",
        activeTabId: "tab-1",
        tabs: [{ id: "tab-1", paneId: "terminal-1" }],
      },
    },
  });

  useNativeViewStore.getState().register("terminal-1", "terminal");
  setNativeViewElement("terminal-1", element);
  useNativeViewStore.getState().reconcile();

  setNativeViewElement("terminal-1", null);

  expect(removeEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
  expect(removeEventListener).toHaveBeenCalledWith("scroll", expect.any(Function), true);
});

test("visible bounds sync reuses an already pending animation frame", () => {
  const requestAnimationFrame = vi.fn(() => 7);
  globalThis.requestAnimationFrame = requestAnimationFrame;
  const cancelAnimationFrame = vi.spyOn(globalThis, "cancelAnimationFrame");
  const element = document.createElement("div");

  useWorkspaceStore.setState({
    activeWorkspaceId: "workspace-1",
    workspaces: [
      {
        id: "workspace-1",
        name: "Workspace",
        root: { type: "leaf", groupId: "group-1" },
        focusedGroupId: "group-1",
        zoomedGroupId: null,
        lastActiveAt: Date.now(),
      },
    ],
    paneGroups: {
      "group-1": {
        id: "group-1",
        activeTabId: "tab-1",
        tabs: [{ id: "tab-1", paneId: "terminal-1" }],
      },
    },
  });

  useNativeViewStore.getState().register("terminal-1", "terminal");
  useNativeViewStore.setState({ visibleTerminals: ["terminal-1"] });

  setNativeViewElement("terminal-1", element);
  setNativeViewElement("terminal-1", element);

  expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
  expect(cancelAnimationFrame).not.toHaveBeenCalled();
});

test("workspace visibility subscription skips unrelated workspace updates", () => {
  const collectGroupIds = vi.spyOn(splitTree, "collectGroupIds");

  useWorkspaceStore.setState({
    activeWorkspaceId: "workspace-1",
    workspaces: [
      {
        id: "workspace-1",
        name: "Workspace",
        root: { type: "leaf", groupId: "group-1" },
        focusedGroupId: "group-1",
        zoomedGroupId: null,
        lastActiveAt: Date.now(),
      },
      {
        id: "workspace-2",
        name: "Workspace 2",
        root: { type: "leaf", groupId: "group-2" },
        focusedGroupId: "group-2",
        zoomedGroupId: null,
        lastActiveAt: Date.now(),
      },
    ],
    panes: {
      "pane-1": {
        id: "pane-1",
        title: "Terminal One",
        type: "terminal",
        config: {},
      },
      "pane-2": {
        id: "pane-2",
        title: "Browser One",
        type: "browser",
        config: { url: "https://example.com" },
      },
      "pane-3": {
        id: "pane-3",
        title: "Browser Two",
        type: "browser",
        config: { url: "https://example.org" },
      },
    },
    paneGroups: {
      "group-1": {
        id: "group-1",
        activeTabId: "tab-1",
        tabs: [{ id: "tab-1", paneId: "pane-1" }],
      },
      "group-2": {
        id: "group-2",
        activeTabId: "tab-2",
        tabs: [
          { id: "tab-2", paneId: "pane-2" },
          { id: "tab-3", paneId: "pane-3" },
        ],
      },
    },
  });

  initNativeViewSubscriptions();
  collectGroupIds.mockClear();

  useWorkspaceStore.getState().updatePaneTitle("pane-1", "Renamed terminal");
  useWorkspaceStore.getState().setActiveGroupTab("workspace-2", "group-2", "tab-3");

  expect(collectGroupIds).not.toHaveBeenCalled();
});
