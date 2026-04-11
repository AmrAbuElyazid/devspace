import { mkdirSync } from "fs";
import { join } from "path";
import { DatabaseSync } from "node:sqlite";
import type { PersistedWorkspaceState } from "../shared/workspace-persistence";

type SqliteStatement = {
  all: (params?: Record<string, unknown>) => Array<Record<string, unknown>>;
  get: (params?: Record<string, unknown>) => Record<string, unknown> | undefined;
  run: (params?: Record<string, unknown>) => unknown;
};

type SqliteDatabase = {
  exec: (sql: string) => void;
  prepare: (sql: string) => SqliteStatement;
  close: () => void;
};

type PreparedWorkspaceRow = {
  id: string;
  name: string;
  focusedGroupId: string | null;
  zoomedGroupId: string | null;
  lastActiveAt: number;
  lastTerminalCwd: string | null;
  rootJson: string;
};

type PreparedPaneRow = {
  id: string;
  type: string;
  title: string;
  configJson: string;
};

type PreparedTabRow = {
  id: string;
  groupId: string;
  paneId: string;
  position: number;
};

type PreparedPaneGroupRow = {
  id: string;
  activeTabId: string;
  tabs: PreparedTabRow[];
};

type PreparedWorkspaceSnapshot = {
  workspaceRows: PreparedWorkspaceRow[];
  paneRows: PreparedPaneRow[];
  paneGroupRows: PreparedPaneGroupRow[];
  activeWorkspaceId: string;
  sidebarTreeJson: string;
  pinnedSidebarNodesJson: string;
};

const SCHEMA_VERSION = "1";

function prepareSnapshot(snapshot: PersistedWorkspaceState): PreparedWorkspaceSnapshot {
  return {
    workspaceRows: snapshot.workspaces.map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      focusedGroupId: workspace.focusedGroupId,
      zoomedGroupId: workspace.zoomedGroupId,
      lastActiveAt: workspace.lastActiveAt,
      lastTerminalCwd: workspace.lastTerminalCwd ?? null,
      rootJson: JSON.stringify(workspace.root),
    })),
    paneRows: Object.values(snapshot.panes).map((pane) => ({
      id: pane.id,
      type: pane.type,
      title: pane.title,
      configJson: JSON.stringify(pane.config),
    })),
    paneGroupRows: Object.values(snapshot.paneGroups).map((group) => ({
      id: group.id,
      activeTabId: group.activeTabId,
      tabs: group.tabs.map((tab, position) => ({
        id: tab.id,
        groupId: group.id,
        paneId: tab.paneId,
        position,
      })),
    })),
    activeWorkspaceId: snapshot.activeWorkspaceId,
    sidebarTreeJson: JSON.stringify(snapshot.sidebarTree),
    pinnedSidebarNodesJson: JSON.stringify(snapshot.pinnedSidebarNodes),
  };
}

function rowsById<Row extends { id: string }>(rows: Row[]): Map<string, Row> {
  return new Map(rows.map((row) => [row.id, row]));
}

function tabsEqual(previous: PreparedTabRow[], next: PreparedTabRow[]): boolean {
  if (previous.length !== next.length) return false;
  return previous.every((tab, index) => {
    const nextTab = next[index];
    return (
      nextTab !== undefined &&
      tab.id === nextTab.id &&
      tab.groupId === nextTab.groupId &&
      tab.paneId === nextTab.paneId &&
      tab.position === nextTab.position
    );
  });
}

function workspaceRowsEqual(previous: PreparedWorkspaceRow, next: PreparedWorkspaceRow): boolean {
  return (
    previous.name === next.name &&
    previous.focusedGroupId === next.focusedGroupId &&
    previous.zoomedGroupId === next.zoomedGroupId &&
    previous.lastActiveAt === next.lastActiveAt &&
    previous.lastTerminalCwd === next.lastTerminalCwd &&
    previous.rootJson === next.rootJson
  );
}

function paneRowsEqual(previous: PreparedPaneRow, next: PreparedPaneRow): boolean {
  return (
    previous.type === next.type &&
    previous.title === next.title &&
    previous.configJson === next.configJson
  );
}

function paneGroupRowsEqual(previous: PreparedPaneGroupRow, next: PreparedPaneGroupRow): boolean {
  return previous.activeTabId === next.activeTabId && tabsEqual(previous.tabs, next.tabs);
}

export class WorkspacePersistenceStore {
  private readonly filePath: string;
  private db: SqliteDatabase | null = null;
  private lastSavedSnapshot: PreparedWorkspaceSnapshot | null = null;

  constructor(userDataPath: string) {
    this.filePath = join(userDataPath, "workspace-state.sqlite");
  }

  load(): PersistedWorkspaceState | null {
    const db = this.getDb();
    const workspaceRows = db
      .prepare(
        `SELECT id, name, focused_group_id, zoomed_group_id, last_active_at, last_terminal_cwd, root_json
         FROM workspaces
         ORDER BY rowid`,
      )
      .all();

    if (workspaceRows.length === 0) {
      this.lastSavedSnapshot = null;
      return null;
    }

    const paneRows = db
      .prepare(`SELECT id, type, title, config_json FROM panes ORDER BY rowid`)
      .all();
    const groupRows = db.prepare(`SELECT id, active_tab_id FROM pane_groups ORDER BY rowid`).all();
    const tabRows = db
      .prepare(
        `SELECT id, group_id, pane_id, position
         FROM pane_group_tabs
         ORDER BY group_id, position`,
      )
      .all();
    const metaRows = db.prepare(`SELECT key, value FROM meta`).all();

    const meta = new Map<string, string>();
    for (const row of metaRows) {
      if (typeof row["key"] === "string" && typeof row["value"] === "string") {
        meta.set(row["key"], row["value"]);
      }
    }

    const activeWorkspaceId = meta.get("active_workspace_id");
    const sidebarTreeJson = meta.get("sidebar_tree_json");
    const pinnedSidebarNodesJson = meta.get("pinned_sidebar_nodes_json");

    if (!activeWorkspaceId || !sidebarTreeJson || !pinnedSidebarNodesJson) {
      this.lastSavedSnapshot = null;
      return null;
    }

    try {
      const panes = Object.fromEntries(
        paneRows.map((row) => [
          row["id"],
          {
            id: String(row["id"]),
            type: String(row["type"]),
            title: String(row["title"]),
            config: JSON.parse(String(row["config_json"])),
          },
        ]),
      );

      const tabsByGroupId = new Map<string, Array<{ id: string; paneId: string }>>();
      for (const row of tabRows) {
        const groupId = String(row["group_id"]);
        const tabs = tabsByGroupId.get(groupId) ?? [];
        tabs.push({ id: String(row["id"]), paneId: String(row["pane_id"]) });
        tabsByGroupId.set(groupId, tabs);
      }

      const paneGroups = Object.fromEntries(
        groupRows.map((row) => {
          const id = String(row["id"]);
          return [
            id,
            {
              id,
              activeTabId: String(row["active_tab_id"]),
              tabs: tabsByGroupId.get(id) ?? [],
            },
          ];
        }),
      );

      const snapshot = {
        workspaces: workspaceRows.map((row) => ({
          id: String(row["id"]),
          name: String(row["name"]),
          focusedGroupId:
            typeof row["focused_group_id"] === "string" ? String(row["focused_group_id"]) : null,
          zoomedGroupId:
            typeof row["zoomed_group_id"] === "string" ? String(row["zoomed_group_id"]) : null,
          lastActiveAt: Number(row["last_active_at"]),
          ...(typeof row["last_terminal_cwd"] === "string"
            ? { lastTerminalCwd: String(row["last_terminal_cwd"]) }
            : {}),
          root: JSON.parse(String(row["root_json"])),
        })),
        activeWorkspaceId,
        panes,
        paneGroups,
        pinnedSidebarNodes: JSON.parse(pinnedSidebarNodesJson),
        sidebarTree: JSON.parse(sidebarTreeJson),
      };
      this.lastSavedSnapshot = prepareSnapshot(snapshot);
      return snapshot;
    } catch (error) {
      this.lastSavedSnapshot = null;
      console.warn("[WorkspacePersistenceStore] Failed to read workspace state:", error);
      return null;
    }
  }

  save(snapshot: PersistedWorkspaceState): void {
    const nextSnapshot = prepareSnapshot(snapshot);
    const db = this.getDb();
    db.exec("BEGIN IMMEDIATE TRANSACTION");

    try {
      if (this.lastSavedSnapshot) {
        this.saveIncremental(db, this.lastSavedSnapshot, nextSnapshot);
      } else {
        this.saveFullSnapshot(db, nextSnapshot);
      }

      db.exec("COMMIT");
      this.lastSavedSnapshot = nextSnapshot;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  private getDb(): SqliteDatabase {
    if (!this.db) {
      this.db = this.openDb();
    }

    return this.db;
  }

  private openDb(): SqliteDatabase {
    mkdirSync(this.getDirectoryPath(), { recursive: true });
    const db = new DatabaseSync(this.filePath) as unknown as SqliteDatabase;

    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        focused_group_id TEXT,
        zoomed_group_id TEXT,
        last_active_at INTEGER NOT NULL,
        last_terminal_cwd TEXT,
        root_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS panes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        config_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pane_groups (
        id TEXT PRIMARY KEY,
        active_tab_id TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pane_group_tabs (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL,
        pane_id TEXT NOT NULL,
        position INTEGER NOT NULL
      );
    `);

    return db;
  }

  private saveFullSnapshot(db: SqliteDatabase, snapshot: PreparedWorkspaceSnapshot): void {
    db.exec("DELETE FROM pane_group_tabs");
    db.exec("DELETE FROM pane_groups");
    db.exec("DELETE FROM panes");
    db.exec("DELETE FROM workspaces");
    db.exec("DELETE FROM meta");

    const insertWorkspace = db.prepare(
      `INSERT INTO workspaces (
         id, name, focused_group_id, zoomed_group_id, last_active_at, last_terminal_cwd, root_json
       ) VALUES (
         $id, $name, $focusedGroupId, $zoomedGroupId, $lastActiveAt, $lastTerminalCwd, $rootJson
       )`,
    );
    const insertPane = db.prepare(
      `INSERT INTO panes (id, type, title, config_json)
       VALUES ($id, $type, $title, $configJson)`,
    );
    const insertPaneGroup = db.prepare(
      `INSERT INTO pane_groups (id, active_tab_id)
       VALUES ($id, $activeTabId)`,
    );
    const insertPaneGroupTab = db.prepare(
      `INSERT INTO pane_group_tabs (id, group_id, pane_id, position)
       VALUES ($id, $groupId, $paneId, $position)`,
    );
    const insertMeta = db.prepare(`INSERT INTO meta (key, value) VALUES ($key, $value)`);

    for (const workspace of snapshot.workspaceRows) {
      insertWorkspace.run({
        $id: workspace.id,
        $name: workspace.name,
        $focusedGroupId: workspace.focusedGroupId,
        $zoomedGroupId: workspace.zoomedGroupId,
        $lastActiveAt: workspace.lastActiveAt,
        $lastTerminalCwd: workspace.lastTerminalCwd,
        $rootJson: workspace.rootJson,
      });
    }

    for (const pane of snapshot.paneRows) {
      insertPane.run({
        $id: pane.id,
        $type: pane.type,
        $title: pane.title,
        $configJson: pane.configJson,
      });
    }

    for (const group of snapshot.paneGroupRows) {
      insertPaneGroup.run({
        $id: group.id,
        $activeTabId: group.activeTabId,
      });

      for (const tab of group.tabs) {
        insertPaneGroupTab.run({
          $id: tab.id,
          $groupId: tab.groupId,
          $paneId: tab.paneId,
          $position: tab.position,
        });
      }
    }

    insertMeta.run({ $key: "schema_version", $value: SCHEMA_VERSION });
    insertMeta.run({ $key: "active_workspace_id", $value: snapshot.activeWorkspaceId });
    insertMeta.run({ $key: "sidebar_tree_json", $value: snapshot.sidebarTreeJson });
    insertMeta.run({ $key: "pinned_sidebar_nodes_json", $value: snapshot.pinnedSidebarNodesJson });
  }

  private saveIncremental(
    db: SqliteDatabase,
    previous: PreparedWorkspaceSnapshot,
    next: PreparedWorkspaceSnapshot,
  ): void {
    const previousWorkspaces = rowsById(previous.workspaceRows);
    const nextWorkspaces = rowsById(next.workspaceRows);
    const previousPanes = rowsById(previous.paneRows);
    const nextPanes = rowsById(next.paneRows);
    const previousGroups = rowsById(previous.paneGroupRows);
    const nextGroups = rowsById(next.paneGroupRows);

    const deleteWorkspace = db.prepare(`DELETE FROM workspaces WHERE id = $id`);
    const upsertWorkspace = db.prepare(
      `INSERT INTO workspaces (
         id, name, focused_group_id, zoomed_group_id, last_active_at, last_terminal_cwd, root_json
       ) VALUES (
         $id, $name, $focusedGroupId, $zoomedGroupId, $lastActiveAt, $lastTerminalCwd, $rootJson
       )
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         focused_group_id = excluded.focused_group_id,
         zoomed_group_id = excluded.zoomed_group_id,
         last_active_at = excluded.last_active_at,
         last_terminal_cwd = excluded.last_terminal_cwd,
         root_json = excluded.root_json`,
    );
    const deletePane = db.prepare(`DELETE FROM panes WHERE id = $id`);
    const upsertPane = db.prepare(
      `INSERT INTO panes (id, type, title, config_json)
       VALUES ($id, $type, $title, $configJson)
       ON CONFLICT(id) DO UPDATE SET
         type = excluded.type,
         title = excluded.title,
         config_json = excluded.config_json`,
    );
    const deletePaneGroupTabs = db.prepare(`DELETE FROM pane_group_tabs WHERE group_id = $groupId`);
    const deletePaneGroup = db.prepare(`DELETE FROM pane_groups WHERE id = $id`);
    const upsertPaneGroup = db.prepare(
      `INSERT INTO pane_groups (id, active_tab_id)
       VALUES ($id, $activeTabId)
       ON CONFLICT(id) DO UPDATE SET
         active_tab_id = excluded.active_tab_id`,
    );
    const insertPaneGroupTab = db.prepare(
      `INSERT INTO pane_group_tabs (id, group_id, pane_id, position)
       VALUES ($id, $groupId, $paneId, $position)
       ON CONFLICT(id) DO UPDATE SET
         group_id = excluded.group_id,
         pane_id = excluded.pane_id,
         position = excluded.position`,
    );
    const upsertMeta = db.prepare(
      `INSERT INTO meta (key, value)
       VALUES ($key, $value)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    );

    for (const previousWorkspace of previous.workspaceRows) {
      if (!nextWorkspaces.has(previousWorkspace.id)) {
        deleteWorkspace.run({ $id: previousWorkspace.id });
      }
    }

    for (const workspace of next.workspaceRows) {
      const previousWorkspace = previousWorkspaces.get(workspace.id);
      if (!previousWorkspace || !workspaceRowsEqual(previousWorkspace, workspace)) {
        upsertWorkspace.run({
          $id: workspace.id,
          $name: workspace.name,
          $focusedGroupId: workspace.focusedGroupId,
          $zoomedGroupId: workspace.zoomedGroupId,
          $lastActiveAt: workspace.lastActiveAt,
          $lastTerminalCwd: workspace.lastTerminalCwd,
          $rootJson: workspace.rootJson,
        });
      }
    }

    for (const previousPane of previous.paneRows) {
      if (!nextPanes.has(previousPane.id)) {
        deletePane.run({ $id: previousPane.id });
      }
    }

    for (const pane of next.paneRows) {
      const previousPane = previousPanes.get(pane.id);
      if (!previousPane || !paneRowsEqual(previousPane, pane)) {
        upsertPane.run({
          $id: pane.id,
          $type: pane.type,
          $title: pane.title,
          $configJson: pane.configJson,
        });
      }
    }

    for (const previousGroup of previous.paneGroupRows) {
      if (!nextGroups.has(previousGroup.id)) {
        deletePaneGroupTabs.run({ $groupId: previousGroup.id });
        deletePaneGroup.run({ $id: previousGroup.id });
      }
    }

    for (const group of next.paneGroupRows) {
      const previousGroup = previousGroups.get(group.id);
      if (!previousGroup || !paneGroupRowsEqual(previousGroup, group)) {
        upsertPaneGroup.run({
          $id: group.id,
          $activeTabId: group.activeTabId,
        });
        deletePaneGroupTabs.run({ $groupId: group.id });
        for (const tab of group.tabs) {
          insertPaneGroupTab.run({
            $id: tab.id,
            $groupId: tab.groupId,
            $paneId: tab.paneId,
            $position: tab.position,
          });
        }
      }
    }

    upsertMeta.run({ $key: "schema_version", $value: SCHEMA_VERSION });
    upsertMeta.run({ $key: "active_workspace_id", $value: next.activeWorkspaceId });
    upsertMeta.run({ $key: "sidebar_tree_json", $value: next.sidebarTreeJson });
    upsertMeta.run({ $key: "pinned_sidebar_nodes_json", $value: next.pinnedSidebarNodesJson });
  }

  private getDirectoryPath(): string {
    const lastSlashIndex = this.filePath.lastIndexOf("/");
    return lastSlashIndex === -1 ? "." : this.filePath.slice(0, lastSlashIndex);
  }
}
