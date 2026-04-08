import { expect, test, vi } from "vitest";

import { createBrowserPaneHistoryTracker } from "../browser-pane-history-tracker";

function makePane(url = "https://example.com") {
  return {
    runtimeState: {
      paneId: "pane-1",
      url,
    },
  } as never;
}

test("tracks committed visits and refreshes their titles", () => {
  const recordVisit = vi.fn();
  const tracker = createBrowserPaneHistoryTracker({
    recordVisit,
    importEntries: vi.fn(),
    clearAll: vi.fn(),
  });
  const pane = makePane();

  tracker.recordCommittedVisit(pane, "https://example.com");
  tracker.refreshPendingTitle(pane, "Example");

  expect(recordVisit).toHaveBeenCalledTimes(2);
  expect(recordVisit).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      url: "https://example.com",
      title: "https://example.com",
      source: "devspace",
    }),
  );
  expect(recordVisit).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      url: "https://example.com",
      title: "Example",
      source: "devspace",
    }),
  );
});

test("stops refreshing titles after the pane is deleted", () => {
  const recordVisit = vi.fn();
  const tracker = createBrowserPaneHistoryTracker({
    recordVisit,
    importEntries: vi.fn(),
    clearAll: vi.fn(),
  });
  const pane = makePane();

  tracker.recordCommittedVisit(pane, "https://example.com");
  tracker.deletePane("pane-1");
  tracker.refreshPendingTitle(pane, "Example");

  expect(recordVisit).toHaveBeenCalledTimes(1);
});
