import { afterEach, expect, test } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { WorkspacePersistenceStore } from "./workspace-persistence-store";
import type { PersistedWorkspaceState } from "../shared/workspace-persistence";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

test("workspace persistence store saves and reloads a snapshot", async () => {
  const userDataPath = await mkdtemp(join(tmpdir(), "devspace-workspace-db-"));
  tempDirs.push(userDataPath);

  const store = new WorkspacePersistenceStore(userDataPath);
  const snapshot: PersistedWorkspaceState = {
    activeWorkspaceId: "workspace-1",
    workspaces: [
      {
        id: "workspace-1",
        name: "Persisted Workspace",
        root: { type: "leaf", groupId: "group-1" },
        focusedGroupId: "group-1",
        zoomedGroupId: null,
        lastActiveAt: 123,
        lastTerminalCwd: "/tmp/project",
      },
    ],
    panes: {
      "pane-1": {
        id: "pane-1",
        title: "Shell",
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

  await store.save(snapshot);

  expect(store.load()).toEqual(snapshot);
});

test("workspace persistence store incrementally applies later snapshots", async () => {
  const userDataPath = await mkdtemp(join(tmpdir(), "devspace-workspace-db-"));
  tempDirs.push(userDataPath);

  const store = new WorkspacePersistenceStore(userDataPath);
  const initialSnapshot: PersistedWorkspaceState = {
    activeWorkspaceId: "workspace-1",
    workspaces: [
      {
        id: "workspace-1",
        name: "Workspace One",
        root: { type: "leaf", groupId: "group-1" },
        focusedGroupId: "group-1",
        zoomedGroupId: null,
        lastActiveAt: 100,
        lastTerminalCwd: "/tmp/one",
      },
    ],
    panes: {
      "pane-1": {
        id: "pane-1",
        title: "Shell 1",
        type: "terminal",
        config: { cwd: "/tmp/one" },
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

  const nextSnapshot: PersistedWorkspaceState = {
    activeWorkspaceId: "workspace-2",
    workspaces: [
      {
        id: "workspace-1",
        name: "Workspace One",
        root: {
          type: "branch",
          direction: "horizontal",
          children: [
            { type: "leaf", groupId: "group-1" },
            { type: "leaf", groupId: "group-2" },
          ],
          sizes: [0.5, 0.5],
        },
        focusedGroupId: "group-2",
        zoomedGroupId: null,
        lastActiveAt: 150,
        lastTerminalCwd: "/tmp/two",
      },
      {
        id: "workspace-2",
        name: "Workspace Two",
        root: { type: "leaf", groupId: "group-3" },
        focusedGroupId: "group-3",
        zoomedGroupId: null,
        lastActiveAt: 200,
        lastTerminalCwd: "/tmp/three",
      },
    ],
    panes: {
      "pane-2": {
        id: "pane-2",
        title: "Shell 2",
        type: "terminal",
        config: { cwd: "/tmp/two" },
      },
      "pane-3": {
        id: "pane-3",
        title: "Docs",
        type: "browser",
        config: { url: "https://example.com", zoom: 1.1 },
      },
    },
    paneGroups: {
      "group-2": {
        id: "group-2",
        activeTabId: "tab-2",
        tabs: [{ id: "tab-2", paneId: "pane-2" }],
      },
      "group-3": {
        id: "group-3",
        activeTabId: "tab-3",
        tabs: [{ id: "tab-3", paneId: "pane-3" }],
      },
    },
    pinnedSidebarNodes: [{ type: "workspace", workspaceId: "workspace-1" }],
    sidebarTree: [{ type: "workspace", workspaceId: "workspace-2" }],
  };

  store.save(initialSnapshot);
  store.save(nextSnapshot);

  expect(store.load()).toEqual(nextSnapshot);
});
