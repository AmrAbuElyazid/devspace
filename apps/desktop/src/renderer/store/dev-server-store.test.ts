// @vitest-environment jsdom

import { beforeEach, expect, test } from "vitest";

import type { Pane } from "../types/workspace";
import { useDevServerStore } from "./dev-server-store";
import { useWorkspaceStore } from "./workspace-store";

function terminalPane(id: string, sessionId: string): Pane {
  return {
    id,
    type: "terminal",
    title: "Terminal",
    config: { backend: "managed-tmux", sessionId },
  };
}

/**
 * Installs a pane graph the way the workspace store's own derivations would.
 * `paneOwnersByPaneId` is what the mapping reads, and what its subscription
 * watches, so the shape matters more than the rest of the state.
 */
function setPaneGraph(panes: Pane[], owners: Record<string, string>): void {
  useWorkspaceStore.setState({
    panes: Object.fromEntries(panes.map((pane) => [pane.id, pane])),
    paneOwnersByPaneId: Object.fromEntries(
      Object.entries(owners).map(([paneId, workspaceId]) => [
        paneId,
        { workspaceId, groupId: `group-${workspaceId}` },
      ]),
    ),
  });
}

beforeEach(() => {
  useDevServerStore.setState({ portsBySessionId: {}, portsByWorkspaceId: {} });
  setPaneGraph([], {});
});

test("maps a session's ports onto the workspace that owns its pane", () => {
  setPaneGraph([terminalPane("pane-1", "session-1")], { "pane-1": "workspace-1" });

  useDevServerStore.getState().setPorts([{ sessionId: "session-1", ports: [5173] }]);

  expect(useDevServerStore.getState().portsByWorkspaceId).toEqual({ "workspace-1": [5173] });
});

test("merges the ports of every managed pane in a workspace, lowest first", () => {
  setPaneGraph([terminalPane("pane-1", "session-1"), terminalPane("pane-2", "session-2")], {
    "pane-1": "workspace-1",
    "pane-2": "workspace-1",
  });

  useDevServerStore.getState().setPorts([
    { sessionId: "session-1", ports: [8787] },
    { sessionId: "session-2", ports: [5173, 8787] },
  ]);

  expect(useDevServerStore.getState().portsByWorkspaceId).toEqual({
    "workspace-1": [5173, 8787],
  });
});

test("ignores ports belonging to a session no open pane is attached to", () => {
  setPaneGraph([terminalPane("pane-1", "session-1")], { "pane-1": "workspace-1" });

  useDevServerStore.getState().setPorts([{ sessionId: "session-orphan", ports: [9999] }]);

  expect(useDevServerStore.getState().portsByWorkspaceId).toEqual({});
});

test("keeps the same mapping object when a sweep changes nothing", () => {
  setPaneGraph([terminalPane("pane-1", "session-1")], { "pane-1": "workspace-1" });

  useDevServerStore.getState().setPorts([{ sessionId: "session-1", ports: [5173] }]);
  const first = useDevServerStore.getState().portsByWorkspaceId;
  useDevServerStore.getState().setPorts([{ sessionId: "session-1", ports: [5173] }]);

  // Rows select out of this map; a fresh object each sweep would re-render the
  // whole sidebar every few seconds for no visible change.
  expect(useDevServerStore.getState().portsByWorkspaceId).toBe(first);
});

test("follows a pane that moves to another workspace", () => {
  setPaneGraph([terminalPane("pane-1", "session-1")], { "pane-1": "workspace-1" });
  useDevServerStore.getState().setPorts([{ sessionId: "session-1", ports: [5173] }]);

  setPaneGraph([terminalPane("pane-1", "session-1")], { "pane-1": "workspace-2" });

  expect(useDevServerStore.getState().portsByWorkspaceId).toEqual({ "workspace-2": [5173] });
});

test("drops a workspace's ports when its pane is closed", () => {
  setPaneGraph([terminalPane("pane-1", "session-1")], { "pane-1": "workspace-1" });
  useDevServerStore.getState().setPorts([{ sessionId: "session-1", ports: [5173] }]);

  setPaneGraph([], {});

  expect(useDevServerStore.getState().portsByWorkspaceId).toEqual({});
});

test("clears everything when the main process reports no listeners", () => {
  setPaneGraph([terminalPane("pane-1", "session-1")], { "pane-1": "workspace-1" });
  useDevServerStore.getState().setPorts([{ sessionId: "session-1", ports: [5173] }]);

  useDevServerStore.getState().setPorts([]);

  expect(useDevServerStore.getState().portsByWorkspaceId).toEqual({});
});
