import { describe, expect, test } from "vitest";
import { appendPaneToGroupState } from "./group-tab-append-state";

describe("appendPaneToGroupState", () => {
  test("adds the pane and appends an active tab to the target group", () => {
    const result = appendPaneToGroupState({
      state: {
        panes: {
          "pane-1": { id: "pane-1", type: "terminal", title: "Terminal", config: {} },
        },
        paneGroups: {
          "group-1": {
            id: "group-1",
            tabs: [{ id: "tab-1", paneId: "pane-1" }],
            activeTabId: "tab-1",
          },
        },
      },
      group: {
        id: "group-1",
        tabs: [{ id: "tab-1", paneId: "pane-1" }],
        activeTabId: "tab-1",
      },
      pane: { id: "pane-2", type: "browser", title: "Browser", config: { url: "https://x" } },
      tabId: "tab-2",
    });

    expect(result.newTab).toEqual({ id: "tab-2", paneId: "pane-2" });
    expect(result.panes["pane-2"]?.type).toBe("browser");
    expect(result.paneGroups["group-1"]).toEqual({
      id: "group-1",
      tabs: [
        { id: "tab-1", paneId: "pane-1" },
        { id: "tab-2", paneId: "pane-2" },
      ],
      activeTabId: "tab-2",
    });
  });
});
