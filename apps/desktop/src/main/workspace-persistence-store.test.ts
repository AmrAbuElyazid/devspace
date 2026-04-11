import { afterEach, expect, test } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { DatabaseSync } from "node:sqlite";
import { WorkspacePersistenceStore } from "./workspace-persistence-store";
import type { PersistedWorkspaceState } from "../shared/workspace-persistence";
import { WORKSPACE_SCHEMA_VERSION } from "./workspace-persistence-migrations";

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

test("workspace persistence store migrates legacy databases without schema_version", async () => {
  const userDataPath = await mkdtemp(join(tmpdir(), "devspace-workspace-db-"));
  tempDirs.push(userDataPath);

  const snapshot: PersistedWorkspaceState = {
    activeWorkspaceId: "workspace-1",
    workspaces: [
      {
        id: "workspace-1",
        name: "Legacy Workspace",
        root: { type: "leaf", groupId: "group-1" },
        focusedGroupId: "group-1",
        zoomedGroupId: null,
        lastActiveAt: 321,
        lastTerminalCwd: "/tmp/legacy",
      },
    ],
    panes: {
      "pane-1": {
        id: "pane-1",
        title: "Legacy Shell",
        type: "terminal",
        config: { cwd: "/tmp/legacy" },
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

  const db = new DatabaseSync(join(userDataPath, "workspace-state.sqlite"));
  db.exec(`
    CREATE TABLE meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      focused_group_id TEXT,
      zoomed_group_id TEXT,
      last_active_at INTEGER NOT NULL,
      last_terminal_cwd TEXT,
      root_json TEXT NOT NULL
    );

    CREATE TABLE panes (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      config_json TEXT NOT NULL
    );

    CREATE TABLE pane_groups (
      id TEXT PRIMARY KEY,
      active_tab_id TEXT NOT NULL
    );

    CREATE TABLE pane_group_tabs (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      pane_id TEXT NOT NULL,
      position INTEGER NOT NULL
    );
  `);
  db.prepare(
    `INSERT INTO workspaces VALUES ($id, $name, $focusedGroupId, $zoomedGroupId, $lastActiveAt, $lastTerminalCwd, $rootJson)`,
  ).run({
    $id: "workspace-1",
    $name: "Legacy Workspace",
    $focusedGroupId: "group-1",
    $zoomedGroupId: null,
    $lastActiveAt: 321,
    $lastTerminalCwd: "/tmp/legacy",
    $rootJson: JSON.stringify(snapshot.workspaces[0]?.root),
  });
  db.prepare(`INSERT INTO panes VALUES ($id, $type, $title, $configJson)`).run({
    $id: "pane-1",
    $type: "terminal",
    $title: "Legacy Shell",
    $configJson: JSON.stringify(snapshot.panes["pane-1"]?.config),
  });
  db.prepare(`INSERT INTO pane_groups VALUES ($id, $activeTabId)`).run({
    $id: "group-1",
    $activeTabId: "tab-1",
  });
  db.prepare(`INSERT INTO pane_group_tabs VALUES ($id, $groupId, $paneId, $position)`).run({
    $id: "tab-1",
    $groupId: "group-1",
    $paneId: "pane-1",
    $position: 0,
  });
  const insertMeta = db.prepare(`INSERT INTO meta VALUES ($key, $value)`);
  insertMeta.run({ $key: "active_workspace_id", $value: snapshot.activeWorkspaceId });
  insertMeta.run({ $key: "sidebar_tree_json", $value: JSON.stringify(snapshot.sidebarTree) });
  insertMeta.run({
    $key: "pinned_sidebar_nodes_json",
    $value: JSON.stringify(snapshot.pinnedSidebarNodes),
  });
  db.close();

  const store = new WorkspacePersistenceStore(userDataPath);
  expect(store.load()).toEqual(snapshot);

  const migratedDb = new DatabaseSync(join(userDataPath, "workspace-state.sqlite"));
  expect(
    migratedDb.prepare(`SELECT value FROM meta WHERE key = $key`).get({ $key: "schema_version" })?.[
      "value"
    ],
  ).toBe(String(WORKSPACE_SCHEMA_VERSION));
  migratedDb.close();
});

test("workspace persistence store rejects unsupported future schema versions", async () => {
  const userDataPath = await mkdtemp(join(tmpdir(), "devspace-workspace-db-"));
  tempDirs.push(userDataPath);

  const db = new DatabaseSync(join(userDataPath, "workspace-state.sqlite"));
  db.exec(`
    CREATE TABLE meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  db.prepare(`INSERT INTO meta VALUES ($key, $value)`).run({
    $key: "schema_version",
    $value: String(WORKSPACE_SCHEMA_VERSION + 1),
  });
  db.close();

  const store = new WorkspacePersistenceStore(userDataPath);
  expect(() => store.load()).toThrow(/Unsupported workspace schema version/);
});
