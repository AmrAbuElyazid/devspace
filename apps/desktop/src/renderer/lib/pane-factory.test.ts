import { describe, expect, test } from "vitest";
import { createPaneWithInheritedConfig, findNearestTerminalCwd } from "./pane-factory";
import type { Pane, PaneGroup, Workspace } from "../types/workspace";

// ---------------------------------------------------------------------------
// Helpers — build minimal fixtures satisfying full type requirements
// ---------------------------------------------------------------------------

let counter = 0;

function makeTerminalPane(cwd?: string): Pane {
  counter++;
  return {
    id: `p-${counter}`,
    title: "Terminal",
    type: "terminal",
    config: cwd ? { cwd } : {},
  };
}

function makeBrowserPane(): Pane {
  counter++;
  return {
    id: `p-${counter}`,
    title: "Browser",
    type: "browser",
    config: { url: "https://example.com" },
  };
}

function makeGroup(
  id: string,
  tabs: { id: string; paneId: string }[],
  activeTabId: string,
): PaneGroup {
  return { id, tabs, activeTabId };
}

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: "ws-1",
    name: "Test",
    root: { type: "leaf", groupId: "g-1" },
    focusedGroupId: "g-1",
    zoomedGroupId: null,
    lastActiveAt: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("findNearestTerminalCwd", () => {
  test("tier 1: returns CWD from active tab in specified group", () => {
    const panes: Record<string, Pane> = {
      "p-1": makeTerminalPane("/projects/a"),
      "p-2": makeTerminalPane("/projects/b"),
    };
    const paneGroups: Record<string, PaneGroup> = {
      "g-1": makeGroup(
        "g-1",
        [
          { id: "t-1", paneId: "p-1" },
          { id: "t-2", paneId: "p-2" },
        ],
        "t-1",
      ),
    };
    const ws = makeWorkspace({ focusedGroupId: "g-1" });
    expect(findNearestTerminalCwd(panes, paneGroups, "g-1", ws)).toBe("/projects/a");
  });

  test("tier 2: falls back to any terminal in group when active tab is not a terminal", () => {
    const panes: Record<string, Pane> = {
      "p-1": makeBrowserPane(),
      "p-2": makeTerminalPane("/projects/b"),
    };
    const paneGroups: Record<string, PaneGroup> = {
      "g-1": makeGroup(
        "g-1",
        [
          { id: "t-1", paneId: "p-1" },
          { id: "t-2", paneId: "p-2" },
        ],
        "t-1",
      ),
    };
    const ws = makeWorkspace({ focusedGroupId: "g-1" });
    expect(findNearestTerminalCwd(panes, paneGroups, "g-1", ws)).toBe("/projects/b");
  });

  test("tier 3: falls back to focused group's active terminal", () => {
    const panes: Record<string, Pane> = {
      "p-1": makeBrowserPane(),
      "p-2": makeTerminalPane("/focused/dir"),
    };
    const paneGroups: Record<string, PaneGroup> = {
      "g-source": makeGroup("g-source", [{ id: "t-1", paneId: "p-1" }], "t-1"),
      "g-focused": makeGroup("g-focused", [{ id: "t-2", paneId: "p-2" }], "t-2"),
    };
    const ws = makeWorkspace({
      focusedGroupId: "g-focused",
      root: {
        type: "branch",
        direction: "horizontal",
        children: [
          { type: "leaf", groupId: "g-source" },
          { type: "leaf", groupId: "g-focused" },
        ],
        sizes: [50, 50],
      },
    });
    expect(findNearestTerminalCwd(panes, paneGroups, "g-source", ws)).toBe("/focused/dir");
  });

  test("tier 3.5: scans all workspace groups when focused group has no terminal", () => {
    const panes: Record<string, Pane> = {
      "p-1": makeBrowserPane(),
      "p-2": makeBrowserPane(),
      "p-3": makeTerminalPane("/other/dir"),
    };
    const paneGroups: Record<string, PaneGroup> = {
      "g-source": makeGroup("g-source", [{ id: "t-1", paneId: "p-1" }], "t-1"),
      "g-focused": makeGroup("g-focused", [{ id: "t-2", paneId: "p-2" }], "t-2"),
      "g-other": makeGroup("g-other", [{ id: "t-3", paneId: "p-3" }], "t-3"),
    };
    const ws = makeWorkspace({
      focusedGroupId: "g-focused",
      root: {
        type: "branch",
        direction: "horizontal",
        children: [
          { type: "leaf", groupId: "g-source" },
          { type: "leaf", groupId: "g-focused" },
          { type: "leaf", groupId: "g-other" },
        ],
        sizes: [33, 34, 33],
      },
    });
    // This verifies the gap fix — without tier 3.5 this falls through to tier 4
    expect(findNearestTerminalCwd(panes, paneGroups, "g-source", ws)).toBe("/other/dir");
  });

  test("tier 4: falls back to workspace.lastTerminalCwd", () => {
    const panes: Record<string, Pane> = {
      "p-1": makeBrowserPane(),
    };
    const paneGroups: Record<string, PaneGroup> = {
      "g-1": makeGroup("g-1", [{ id: "t-1", paneId: "p-1" }], "t-1"),
    };
    const ws = makeWorkspace({ lastTerminalCwd: "/remembered/dir" });
    expect(findNearestTerminalCwd(panes, paneGroups, "g-1", ws)).toBe("/remembered/dir");
  });

  test("tier 5: returns undefined when no CWD found anywhere", () => {
    const panes: Record<string, Pane> = {
      "p-1": makeBrowserPane(),
    };
    const paneGroups: Record<string, PaneGroup> = {
      "g-1": makeGroup("g-1", [{ id: "t-1", paneId: "p-1" }], "t-1"),
    };
    const ws = makeWorkspace();
    expect(findNearestTerminalCwd(panes, paneGroups, "g-1", ws)).toBeUndefined();
  });
});

describe("createPaneWithInheritedConfig", () => {
  test("inherits terminal cwd from workspace context", () => {
    const panes: Record<string, Pane> = {
      "p-1": makeTerminalPane("/projects/a"),
    };
    const paneGroups: Record<string, PaneGroup> = {
      "g-1": makeGroup("g-1", [{ id: "t-1", paneId: "p-1" }], "t-1"),
    };
    const workspace = makeWorkspace({ focusedGroupId: "g-1" });

    const pane = createPaneWithInheritedConfig("terminal", panes, paneGroups, "g-1", workspace);

    expect(pane.type).toBe("terminal");
    expect(pane.config).toEqual({ cwd: "/projects/a" });
  });

  test("creates note panes with a generated note id", () => {
    const pane = createPaneWithInheritedConfig("note", {}, {}, undefined, undefined);

    expect(pane.type).toBe("note");
    if (pane.type !== "note") {
      throw new Error("expected note pane");
    }
    expect(typeof pane.config.noteId).toBe("string");
    expect(pane.config.noteId).toBeTruthy();
  });
});
