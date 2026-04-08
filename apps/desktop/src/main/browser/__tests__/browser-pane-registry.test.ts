import { expect, test } from "vitest";

import type { BrowserPaneRecord } from "../browser-types";
import { createBrowserPaneRegistry } from "../browser-pane-registry";

test("registry tracks pane lookup by pane id and webContents id", () => {
  const registry = createBrowserPaneRegistry();
  const pane: BrowserPaneRecord = {
    isVisible: false,
    runtimeState: {
      paneId: "pane-1",
      url: "https://example.com",
      title: "https://example.com",
      faviconUrl: null,
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      isSecure: true,
      securityLabel: "Secure",
      currentZoom: 1,
      find: null,
      failure: null,
    },
    bounds: null,
    view: {
      webContents: {
        id: 42,
      },
    },
  } as unknown as BrowserPaneRecord;

  registry.register("pane-1", pane);

  expect(registry.has("pane-1")).toBe(true);
  expect(registry.get("pane-1")).toBe(pane);
  expect(registry.resolvePaneIdForWebContents(42)).toBe("pane-1");

  registry.unregister("pane-1");

  expect(registry.get("pane-1")).toBeUndefined();
  expect(registry.resolvePaneIdForWebContents(42)).toBeUndefined();
});

test("registry clones runtime state snapshots instead of returning live state", () => {
  const registry = createBrowserPaneRegistry();
  const pane: BrowserPaneRecord = {
    isVisible: true,
    runtimeState: {
      paneId: "pane-1",
      url: "https://example.com",
      title: "Example",
      faviconUrl: null,
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      isSecure: true,
      securityLabel: "Secure",
      currentZoom: 1,
      find: {
        query: "hello",
        activeMatch: 1,
        totalMatches: 2,
      },
      failure: null,
    },
    bounds: null,
    view: {
      webContents: {},
    },
  } as unknown as BrowserPaneRecord;

  registry.register("pane-1", pane);

  const snapshot = registry.getRuntimeState("pane-1");

  expect(snapshot).toEqual(pane.runtimeState);
  expect(snapshot).not.toBe(pane.runtimeState);
  expect(snapshot?.find).not.toBe(pane.runtimeState.find);
  expect(registry.isVisible("pane-1")).toBe(true);
});
