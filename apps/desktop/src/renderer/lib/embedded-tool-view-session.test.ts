import { beforeEach, expect, test, vi } from "vitest";
import {
  hasCreatedEmbeddedToolView,
  markEmbeddedToolViewCreated,
  markEmbeddedToolViewInactive,
  markEmbeddedToolViewReady,
  MAX_INACTIVE_EMBEDDED_TOOL_VIEWS,
  resetTrackedEmbeddedToolViewsForTests,
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
