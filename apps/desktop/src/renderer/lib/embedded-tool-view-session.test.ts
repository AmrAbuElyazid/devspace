import { beforeEach, expect, test, vi } from "vitest";
import {
  getEmbeddedToolViewSnapshot,
  hasCreatedEmbeddedToolView,
  markEmbeddedToolViewCreated,
  markEmbeddedToolViewDestroyed,
  markEmbeddedToolViewFailed,
  markEmbeddedToolViewInactive,
  markEmbeddedToolViewReady,
  MAX_INACTIVE_EMBEDDED_TOOL_VIEWS,
  resetTrackedEmbeddedToolViewsForTests,
  subscribeEmbeddedToolView,
} from "./embedded-tool-view-session";

beforeEach(() => {
  resetTrackedEmbeddedToolViewsForTests();
});

test("bounds inactive editor and t3 WebContents views without stopping their servers", () => {
  const evictions = Array.from({ length: MAX_INACTIVE_EMBEDDED_TOOL_VIEWS + 3 }, () =>
    vi.fn(() => {}),
  );

  for (let index = 0; index < evictions.length; index++) {
    const paneId = `tool-${index}`;
    markEmbeddedToolViewCreated(paneId, evictions[index]!);
    markEmbeddedToolViewReady(paneId);
    markEmbeddedToolViewInactive(paneId);
  }

  expect(evictions.filter((evict) => evict.mock.calls.length > 0)).toHaveLength(3);
  expect(hasCreatedEmbeddedToolView("tool-0")).toBe(false);
  expect(hasCreatedEmbeddedToolView(`tool-${evictions.length - 1}`)).toBe(true);
});

test("does not evict a view while its asynchronous start is pending", () => {
  const evict = vi.fn();
  markEmbeddedToolViewCreated("pending", evict);
  markEmbeddedToolViewInactive("pending");

  expect(evict).not.toHaveBeenCalled();
  expect(hasCreatedEmbeddedToolView("pending")).toBe(true);
});

test("shares pending failures with remounted consumers and ignores stale completions", () => {
  const listener = vi.fn();
  subscribeEmbeddedToolView("editor", listener);
  const firstGeneration = markEmbeddedToolViewCreated("editor", vi.fn());

  expect(markEmbeddedToolViewFailed("editor", firstGeneration, "start failed")).toBe(true);
  expect(getEmbeddedToolViewSnapshot("editor")).toMatchObject({
    phase: "error",
    error: "start failed",
  });

  markEmbeddedToolViewDestroyed("editor");
  const secondGeneration = markEmbeddedToolViewCreated("editor", vi.fn());
  expect(markEmbeddedToolViewFailed("editor", firstGeneration, "stale")).toBe(false);
  expect(getEmbeddedToolViewSnapshot("editor")).toMatchObject({
    phase: "pending",
    generation: secondGeneration,
  });
  expect(listener).toHaveBeenCalled();
});
