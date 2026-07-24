import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  callRegisteredHandler,
  createElectronIpcMock,
  createIpcHandlerRegistry,
} from "./test-utils/mock-electron-ipc";

const handlers = createIpcHandlerRegistry();
const workspaceDataPath = join(tmpdir(), `devspace-workspace-ipc-${process.pid}`);

vi.mock("electron", () =>
  createElectronIpcMock(handlers, {
    app: {
      getPath: () => workspaceDataPath,
    },
  }),
);

const { registerWorkspaceStateIpc } = await import("../ipc/workspace-state");
registerWorkspaceStateIpc();

beforeEach(async () => {
  await rm(workspaceDataPath, { recursive: true, force: true });
});

afterEach(async () => {
  await rm(workspaceDataPath, { recursive: true, force: true });
});

test("workspaceState IPC saves and reloads a persisted snapshot", async () => {
  const snapshot = {
    activeWorkspaceId: "workspace-1",
    workspaces: [
      {
        id: "workspace-1",
        name: "Workspace 1",
        root: { type: "leaf", groupId: "group-1" },
        focusedGroupId: "group-1",
        zoomedGroupId: null,
        lastActiveAt: 1,
      },
    ],
    panes: {
      "pane-1": {
        id: "pane-1",
        title: "Terminal",
        type: "terminal",
        config: { cwd: "/tmp/project" },
      },
    },
    paneGroups: {
      "group-1": {
        id: "group-1",
        activeTabId: "tab-1",
        tabs: [{ id: "tab-1", paneId: "pane-1" }],
      },
    },
    pinnedSidebarNodes: [],
    sidebarTree: [{ type: "workspace", workspaceId: "workspace-1" }],
  };

  await callRegisteredHandler(handlers, "workspaceState:save", snapshot);

  await expect(callRegisteredHandler(handlers, "workspaceState:load")).resolves.toEqual(snapshot);
});

test.each(["terminal", "browser", "editor", "t3code", "note"] as const)(
  "workspaceState IPC accepts the renderer default config for a %s pane",
  async (type) => {
    const defaultConfigs = {
      terminal: {},
      browser: { url: "about:blank" },
      editor: {},
      t3code: {},
      note: { noteId: "note-1" },
    };
    const pane = {
      id: "pane-1",
      type,
      title: type,
      config: defaultConfigs[type],
    };
    const snapshot = {
      activeWorkspaceId: "workspace-1",
      workspaces: [
        {
          id: "workspace-1",
          name: "Workspace 1",
          root: { type: "leaf", groupId: "group-1" },
          focusedGroupId: "group-1",
          zoomedGroupId: null,
          lastActiveAt: 1,
        },
      ],
      panes: { [pane.id]: pane },
      paneGroups: {
        "group-1": {
          id: "group-1",
          activeTabId: "tab-1",
          tabs: [{ id: "tab-1", paneId: pane.id }],
        },
      },
      pinnedSidebarNodes: [],
      sidebarTree: [{ type: "workspace", workspaceId: "workspace-1" }],
    };

    await expect(
      callRegisteredHandler(handlers, "workspaceState:save", snapshot),
    ).resolves.toBeUndefined();
    await expect(callRegisteredHandler(handlers, "workspaceState:load")).resolves.toEqual(snapshot);
  },
);

test("workspaceState IPC accepts managed and external tmux terminal metadata", async () => {
  for (const config of [
    { backend: "managed-tmux", sessionId: "session-1", cwd: "/tmp/project" },
    { backend: "external-tmux", sessionName: "work", socketPath: "/tmp/user-tmux.sock" },
  ]) {
    const snapshot = {
      activeWorkspaceId: "workspace-1",
      workspaces: [
        {
          id: "workspace-1",
          name: "Workspace 1",
          root: { type: "leaf", groupId: "group-1" },
          focusedGroupId: "group-1",
          zoomedGroupId: null,
          lastActiveAt: 1,
        },
      ],
      panes: {
        "pane-1": {
          id: "pane-1",
          title: "Terminal",
          type: "terminal",
          config,
        },
      },
      paneGroups: {
        "group-1": {
          id: "group-1",
          activeTabId: "tab-1",
          tabs: [{ id: "tab-1", paneId: "pane-1" }],
        },
      },
      pinnedSidebarNodes: [],
      sidebarTree: [{ type: "workspace", workspaceId: "workspace-1" }],
    };

    await expect(
      callRegisteredHandler(handlers, "workspaceState:save", snapshot),
    ).resolves.toBeUndefined();
  }
});

test("workspaceState async save rejects invalid payloads", async () => {
  await expect(
    callRegisteredHandler(handlers, "workspaceState:save", { nope: true }),
  ).rejects.toThrow("Invalid workspace state");
});

test("workspaceState patch updates only the supplied entities", async () => {
  const snapshot = {
    activeWorkspaceId: "workspace-1",
    workspaces: [
      {
        id: "workspace-1",
        name: "Workspace 1",
        root: { type: "leaf", groupId: "group-1" },
        focusedGroupId: "group-1",
        zoomedGroupId: null,
        lastActiveAt: 1,
      },
    ],
    panes: {
      "pane-1": { id: "pane-1", title: "Terminal", type: "terminal", config: {} },
    },
    paneGroups: {
      "group-1": {
        id: "group-1",
        activeTabId: "tab-1",
        tabs: [{ id: "tab-1", paneId: "pane-1" }],
      },
    },
    pinnedSidebarNodes: [],
    sidebarTree: [{ type: "workspace", workspaceId: "workspace-1" }],
  };
  await callRegisteredHandler(handlers, "workspaceState:save", snapshot);

  await expect(
    callRegisteredHandler(handlers, "workspaceState:patch", {
      panes: {
        upsert: [{ ...snapshot.panes["pane-1"], title: "Renamed Terminal" }],
        removeIds: [],
      },
    }),
  ).resolves.toEqual({ ok: true });

  await expect(callRegisteredHandler(handlers, "workspaceState:load")).resolves.toEqual({
    ...snapshot,
    panes: {
      "pane-1": { ...snapshot.panes["pane-1"], title: "Renamed Terminal" },
    },
  });
});

test("workspaceState patch rejects malformed and graph-breaking deltas", async () => {
  await callRegisteredHandler(handlers, "workspaceState:save", {
    activeWorkspaceId: "workspace-1",
    workspaces: [
      {
        id: "workspace-1",
        name: "Workspace 1",
        root: { type: "leaf", groupId: "group-1" },
        focusedGroupId: "group-1",
        zoomedGroupId: null,
        lastActiveAt: 1,
      },
    ],
    panes: {
      "pane-1": { id: "pane-1", title: "Terminal", type: "terminal", config: {} },
    },
    paneGroups: {
      "group-1": {
        id: "group-1",
        activeTabId: "tab-1",
        tabs: [{ id: "tab-1", paneId: "pane-1" }],
      },
    },
    pinnedSidebarNodes: [],
    sidebarTree: [{ type: "workspace", workspaceId: "workspace-1" }],
  });

  await expect(
    callRegisteredHandler(handlers, "workspaceState:patch", {
      panes: { upsert: [], removeIds: "pane-1" },
    }),
  ).rejects.toThrow("Invalid workspace state patch");

  await expect(
    callRegisteredHandler(handlers, "workspaceState:patch", {
      panes: { upsert: [], removeIds: ["pane-1"] },
    }),
  ).rejects.toThrow("Invalid workspace state patch result");
});

test("workspaceState async save rejects graph-inconsistent payloads", async () => {
  const snapshot = {
    activeWorkspaceId: "missing-workspace",
    workspaces: [
      {
        id: "workspace-1",
        name: "Workspace 1",
        root: { type: "leaf", groupId: "group-1" },
        focusedGroupId: "group-1",
        zoomedGroupId: null,
        lastActiveAt: 1,
      },
    ],
    panes: {
      "pane-1": { id: "pane-1", title: "Terminal", type: "terminal", config: {} },
    },
    paneGroups: {
      "group-1": {
        id: "group-1",
        activeTabId: "tab-1",
        tabs: [{ id: "tab-1", paneId: "pane-1" }],
      },
    },
    pinnedSidebarNodes: [],
    sidebarTree: [],
  };

  await expect(callRegisteredHandler(handlers, "workspaceState:save", snapshot)).rejects.toThrow(
    "Invalid workspace state",
  );
});

test("workspaceState async save rejects oversized payloads", async () => {
  const snapshot = {
    activeWorkspaceId: "workspace-1",
    workspaces: [
      {
        id: "workspace-1",
        name: "x".repeat(5 * 1024 * 1024),
        root: { type: "leaf", groupId: "group-1" },
        focusedGroupId: "group-1",
        zoomedGroupId: null,
        lastActiveAt: 1,
      },
    ],
    panes: {
      "pane-1": { id: "pane-1", title: "Terminal", type: "terminal", config: {} },
    },
    paneGroups: {
      "group-1": {
        id: "group-1",
        activeTabId: "tab-1",
        tabs: [{ id: "tab-1", paneId: "pane-1" }],
      },
    },
    pinnedSidebarNodes: [],
    sidebarTree: [],
  };

  await expect(callRegisteredHandler(handlers, "workspaceState:save", snapshot)).rejects.toThrow(
    "Invalid workspace state",
  );
});

test("workspaceState sync save reports invalid payloads without writing", () => {
  const handler = handlers.get("workspaceState:saveSync");
  if (!handler) {
    throw new Error("Expected workspaceState:saveSync handler to be registered");
  }

  const event = { returnValue: undefined };
  handler(event, { nope: true });

  expect(event.returnValue).toEqual({ ok: false, error: "Invalid workspace state" });
});
