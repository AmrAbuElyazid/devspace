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

test("workspaceState async save rejects invalid payloads", async () => {
  await expect(
    callRegisteredHandler(handlers, "workspaceState:save", { nope: true }),
  ).rejects.toThrow("Invalid workspace state");
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
