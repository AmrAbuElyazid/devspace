import { beforeEach, expect, test, vi } from "vitest";
import {
  getBrowserPaneSessionSnapshot,
  hasCreatedBrowserPane,
  markBrowserPaneCreated,
  markBrowserPaneDestroyed,
  markBrowserPaneFailed,
  markBrowserPaneInactive,
  markBrowserPaneReady,
  MAX_INACTIVE_BROWSER_PANES,
  resetTrackedBrowserPanesForTests,
  subscribeBrowserPane,
} from "./browser-pane-session";

beforeEach(() => {
  resetTrackedBrowserPanesForTests();
});

test("keeps only a small LRU set of inactive browser renderer processes warm", () => {
  const destroyPane = vi.fn();

  for (let index = 0; index < MAX_INACTIVE_BROWSER_PANES + 3; index++) {
    const paneId = `browser-${index}`;
    markBrowserPaneCreated(paneId);
    markBrowserPaneReady(paneId, destroyPane);
    markBrowserPaneInactive(paneId, destroyPane);
  }

  expect(destroyPane).toHaveBeenCalledTimes(3);
  expect(destroyPane).toHaveBeenNthCalledWith(1, "browser-0");
  expect(hasCreatedBrowserPane("browser-0")).toBe(false);
  expect(hasCreatedBrowserPane(`browser-${MAX_INACTIVE_BROWSER_PANES + 2}`)).toBe(true);
});

test("does not evict a browser pane before asynchronous creation finishes", () => {
  const destroyPane = vi.fn();
  markBrowserPaneCreated("pending");
  markBrowserPaneInactive("pending", destroyPane);

  expect(destroyPane).not.toHaveBeenCalled();
  expect(hasCreatedBrowserPane("pending")).toBe(true);
});

test("keeps late failures observable across remounts and rejects stale generations", () => {
  const listener = vi.fn();
  subscribeBrowserPane("browser", listener);
  const firstGeneration = markBrowserPaneCreated("browser");

  expect(markBrowserPaneFailed("browser", firstGeneration, "create failed")).toBe(true);
  expect(getBrowserPaneSessionSnapshot("browser")).toMatchObject({
    phase: "error",
    error: "create failed",
  });

  markBrowserPaneDestroyed("browser");
  const secondGeneration = markBrowserPaneCreated("browser");
  expect(markBrowserPaneFailed("browser", firstGeneration, "stale")).toBe(false);
  expect(getBrowserPaneSessionSnapshot("browser")).toMatchObject({
    phase: "pending",
    generation: secondGeneration,
  });
  expect(listener).toHaveBeenCalled();
});
