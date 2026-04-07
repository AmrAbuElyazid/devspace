// @vitest-environment jsdom

import { beforeEach, expect, test, vi } from "vitest";
import { useSettingsStore } from "./settings-store";
import {
  getNativeViewProfilingSnapshot,
  recordNativeFocusRequest,
  resetNativeViewProfilingCounters,
  updateNativeViewBounds,
  useNativeViewStore,
} from "./native-view-store";
import { useWorkspaceStore } from "./workspace-store";

beforeEach(() => {
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

  window.api = {
    terminal: {
      setBounds: vi.fn(),
      setVisibleSurfaces: vi.fn(),
      blur: vi.fn(),
    },
    browser: {
      setBounds: vi.fn(),
      setVisiblePanes: vi.fn(),
    },
  } as unknown as typeof window.api;

  resetNativeViewProfilingCounters();
  useNativeViewStore.setState({
    views: {},
    visibleTerminals: [],
    visibleBrowsers: [],
    dragHidesViews: false,
  });
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
