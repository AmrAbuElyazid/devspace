import { describe, expect, test } from "vitest";
import { buildDestinationGroupState } from "./group-tab-destination-state";

describe("buildDestinationGroupState", () => {
  test("updates the destination group and rebuilds recent tab history", () => {
    const result = buildDestinationGroupState({
      state: {
        paneGroups: {
          "group-1": {
            id: "group-1",
            tabs: [{ id: "tab-1", paneId: "pane-1" }],
            activeTabId: "tab-1",
          },
        },
        tabHistoryByGroupId: {
          "group-1": ["stale-tab", "tab-2"],
        },
        recentTabTraversalByGroupId: {
          "group-1": { order: ["tab-2"], index: 0, updatedAt: 1 },
        },
      },
      group: {
        id: "group-1",
        tabs: [{ id: "tab-1", paneId: "pane-1" }],
        activeTabId: "tab-1",
      },
      tabs: [
        { id: "tab-2", paneId: "pane-2" },
        { id: "tab-3", paneId: "pane-3" },
      ],
      activeTabId: "tab-3",
    });

    expect(result.paneGroups["group-1"]).toEqual({
      id: "group-1",
      tabs: [
        { id: "tab-2", paneId: "pane-2" },
        { id: "tab-3", paneId: "pane-3" },
      ],
      activeTabId: "tab-3",
    });
    expect(result.tabHistoryByGroupId["group-1"]).toEqual(["tab-3", "tab-2"]);
    expect(result.recentTabTraversalByGroupId).toEqual({});
  });

  test("builds history for a newly added destination group", () => {
    const result = buildDestinationGroupState({
      state: {
        paneGroups: {},
        tabHistoryByGroupId: {},
        recentTabTraversalByGroupId: {},
      },
      group: {
        id: "group-2",
        tabs: [],
        activeTabId: "",
      },
      tabs: [{ id: "tab-9", paneId: "pane-9" }],
      activeTabId: "tab-9",
    });

    expect(result.paneGroups["group-2"]?.activeTabId).toBe("tab-9");
    expect(result.tabHistoryByGroupId["group-2"]).toEqual(["tab-9"]);
  });
});
