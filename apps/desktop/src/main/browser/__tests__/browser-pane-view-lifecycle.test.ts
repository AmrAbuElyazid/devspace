import { expect, test, vi } from "vitest";
import {
  destroyPaneView,
  hidePaneView,
  setPaneBounds,
  showPaneView,
  syncVisiblePaneViews,
} from "../browser-pane-view-lifecycle";
import type { BrowserPaneRecord } from "../browser-types";

function makePane(): BrowserPaneRecord {
  return {
    view: {
      setBounds: vi.fn(),
      destroy: vi.fn(),
      webContents: {
        setZoomFactor: vi.fn(),
        close: vi.fn(),
      },
    } as never,
    kind: "browser",
    runtimeState: {
      paneId: "pane-1",
      url: "https://example.com",
      title: "Browser",
      faviconUrl: null,
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      isSecure: true,
      securityLabel: "Secure",
      currentZoom: 1.5,
      find: null,
      failure: null,
    },
    bounds: { x: 10, y: 20, width: 800, height: 600 },
    isVisible: false,
  };
}

test("showPaneView reapplies stored bounds and zoom", () => {
  const pane = makePane();
  const deps = {
    addChildView: vi.fn(),
    removeChildView: vi.fn(),
  };

  showPaneView(pane, deps);

  expect(deps.addChildView).toHaveBeenCalledWith(pane.view);
  expect(pane.view.setBounds).toHaveBeenCalledWith(pane.bounds);
  expect(pane.view.webContents.setZoomFactor).toHaveBeenCalledWith(1.5);
  expect(pane.isVisible).toBe(true);
});

test("syncVisiblePaneViews hides stale panes and shows requested panes bounds-first", () => {
  const hiddenPane = makePane();
  const visiblePane = makePane();
  hiddenPane.isVisible = false;
  visiblePane.isVisible = true;
  const order: string[] = [];
  hiddenPane.view.setBounds = vi.fn(() => {
    order.push("setBounds");
  }) as never;
  const deps = {
    addChildView: vi.fn(() => {
      order.push("addChildView");
    }),
    removeChildView: vi.fn(),
  };
  const panes = new Map<string, BrowserPaneRecord>([
    ["hidden", hiddenPane],
    ["visible", visiblePane],
  ]);

  const nextVisible = syncVisiblePaneViews(new Set(["visible"]), panes, ["hidden"], deps);

  expect(deps.removeChildView).toHaveBeenCalledWith(visiblePane.view);
  expect(order).toEqual(["setBounds", "addChildView"]);
  expect(hiddenPane.isVisible).toBe(true);
  expect(visiblePane.isVisible).toBe(false);
  expect([...nextVisible]).toEqual(["hidden"]);
});

test("syncVisiblePaneViews only looks up panes whose visibility can change", () => {
  const hiddenPane = makePane();
  const visiblePane = makePane();
  visiblePane.isVisible = true;
  const getPane = vi.fn((paneId: string) => {
    if (paneId === "hidden") {
      return hiddenPane;
    }
    if (paneId === "visible") {
      return visiblePane;
    }
    return undefined;
  });
  const deps = {
    addChildView: vi.fn(),
    removeChildView: vi.fn(),
  };

  syncVisiblePaneViews(new Set(["visible"]), { get: getPane }, ["hidden"], deps);

  expect(getPane).toHaveBeenCalledTimes(2);
  expect(getPane).toHaveBeenNthCalledWith(1, "visible");
  expect(getPane).toHaveBeenNthCalledWith(2, "hidden");
});

test("setPaneBounds stores the bounds and applies them to the view", () => {
  const pane = makePane();
  const bounds = { x: 5, y: 6, width: 7, height: 8 };

  setPaneBounds(pane, bounds);

  expect(pane.bounds).toEqual(bounds);
  expect(pane.view.setBounds).toHaveBeenCalledWith(bounds);
});

test("destroyPaneView prefers closing webContents before destroying the view", () => {
  const pane = makePane();
  const destroy = (pane.view as unknown as { destroy: ReturnType<typeof vi.fn> }).destroy;

  destroyPaneView(pane);

  expect(pane.view.webContents.close).toHaveBeenCalledTimes(1);
  expect(destroy).not.toHaveBeenCalled();
});

test("hidePaneView removes the child view and flips visibility", () => {
  const pane = makePane();
  pane.isVisible = true;
  const deps = {
    addChildView: vi.fn(),
    removeChildView: vi.fn(),
  };

  hidePaneView(pane, deps);

  expect(deps.removeChildView).toHaveBeenCalledWith(pane.view);
  expect(pane.isVisible).toBe(false);
});
