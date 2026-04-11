import { mkdirSync } from "fs";
import { join } from "path";
import { DatabaseSync } from "node:sqlite";
import type { PersistedWorkspaceState } from "../shared/workspace-persistence";
import {
  runWorkspaceMigrations,
  WORKSPACE_SCHEMA_VERSION,
} from "./workspace-persistence-migrations";

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

type WorkspacePersistenceStatements = {
  queries: {
    selectWorkspaces: SqliteStatement;
    selectPanes: SqliteStatement;
    selectPaneGroups: SqliteStatement;
    selectPaneGroupTabs: SqliteStatement;
    selectMeta: SqliteStatement;
  };
  workspaces: {
    insert: SqliteStatement;
    delete: SqliteStatement;
    upsert: SqliteStatement;
    deleteAll: SqliteStatement;
  };
  panes: {
    insert: SqliteStatement;
    delete: SqliteStatement;
    upsert: SqliteStatement;
    deleteAll: SqliteStatement;
  };
  paneGroups: {
    insert: SqliteStatement;
    delete: SqliteStatement;
    upsert: SqliteStatement;
    deleteAll: SqliteStatement;
    deleteTabsByGroupId: SqliteStatement;
    deleteAllTabs: SqliteStatement;
    insertTab: SqliteStatement;
  };
  meta: {
    insert: SqliteStatement;
    upsert: SqliteStatement;
    deleteAll: SqliteStatement;
  };
};

function createWorkspacePersistenceStatements(db: SqliteDatabase): WorkspacePersistenceStatements {
  return {
    queries: {
      selectWorkspaces: db.prepare(
        `SELECT id, name, focused_group_id, zoomed_group_id, last_active_at, last_terminal_cwd, root_json
         FROM workspaces
         ORDER BY rowid`,
      ),
      selectPanes: db.prepare(`SELECT id, type, title, config_json FROM panes ORDER BY rowid`),
      selectPaneGroups: db.prepare(`SELECT id, active_tab_id FROM pane_groups ORDER BY rowid`),
      selectPaneGroupTabs: db.prepare(
        `SELECT id, group_id, pane_id, position
         FROM pane_group_tabs
         ORDER BY group_id, position`,
      ),
      selectMeta: db.prepare(`SELECT key, value FROM meta`),
    },
    workspaces: {
      insert: db.prepare(
        `INSERT INTO workspaces (
           id, name, focused_group_id, zoomed_group_id, last_active_at, last_terminal_cwd, root_json
         ) VALUES (
           $id, $name, $focusedGroupId, $zoomedGroupId, $lastActiveAt, $lastTerminalCwd, $rootJson
         )`,
      ),
      delete: db.prepare(`DELETE FROM workspaces WHERE id = $id`),
      upsert: db.prepare(
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
      ),
      deleteAll: db.prepare(`DELETE FROM workspaces`),
    },
    panes: {
      insert: db.prepare(
        `INSERT INTO panes (id, type, title, config_json)
         VALUES ($id, $type, $title, $configJson)`,
      ),
      delete: db.prepare(`DELETE FROM panes WHERE id = $id`),
      upsert: db.prepare(
        `INSERT INTO panes (id, type, title, config_json)
         VALUES ($id, $type, $title, $configJson)
         ON CONFLICT(id) DO UPDATE SET
           type = excluded.type,
           title = excluded.title,
           config_json = excluded.config_json`,
      ),
      deleteAll: db.prepare(`DELETE FROM panes`),
    },
    paneGroups: {
      insert: db.prepare(
        `INSERT INTO pane_groups (id, active_tab_id)
         VALUES ($id, $activeTabId)`,
      ),
      delete: db.prepare(`DELETE FROM pane_groups WHERE id = $id`),
      upsert: db.prepare(
        `INSERT INTO pane_groups (id, active_tab_id)
         VALUES ($id, $activeTabId)
         ON CONFLICT(id) DO UPDATE SET
           active_tab_id = excluded.active_tab_id`,
      ),
      deleteAll: db.prepare(`DELETE FROM pane_groups`),
      deleteTabsByGroupId: db.prepare(`DELETE FROM pane_group_tabs WHERE group_id = $groupId`),
      deleteAllTabs: db.prepare(`DELETE FROM pane_group_tabs`),
      insertTab: db.prepare(
        `INSERT INTO pane_group_tabs (id, group_id, pane_id, position)
         VALUES ($id, $groupId, $paneId, $position)
         ON CONFLICT(id) DO UPDATE SET
           group_id = excluded.group_id,
           pane_id = excluded.pane_id,
           position = excluded.position`,
      ),
    },
    meta: {
      insert: db.prepare(`INSERT INTO meta (key, value) VALUES ($key, $value)`),
      upsert: db.prepare(
        `INSERT INTO meta (key, value)
         VALUES ($key, $value)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ),
      deleteAll: db.prepare(`DELETE FROM meta`),
    },
  };
}

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
  private statements: WorkspacePersistenceStatements | null = null;

  constructor(userDataPath: string) {
    this.filePath = join(userDataPath, "workspace-state.sqlite");
  }

  load(): PersistedWorkspaceState | null {
    this.getDb();
    const statements = this.getStatements();
    const workspaceRows = statements.queries.selectWorkspaces.all();

    if (workspaceRows.length === 0) {
      this.lastSavedSnapshot = null;
      return null;
    }

    const paneRows = statements.queries.selectPanes.all();
    const groupRows = statements.queries.selectPaneGroups.all();
    const tabRows = statements.queries.selectPaneGroupTabs.all();
    const metaRows = statements.queries.selectMeta.all();

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
        this.saveIncremental(this.lastSavedSnapshot, nextSnapshot);
      } else {
        this.saveFullSnapshot(nextSnapshot);
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
    runWorkspaceMigrations(db);
    this.statements = createWorkspacePersistenceStatements(db);

    return db;
  }

  private getStatements(): WorkspacePersistenceStatements {
    if (!this.statements) {
      this.getDb();
    }

    return this.statements!;
  }

  private saveFullSnapshot(snapshot: PreparedWorkspaceSnapshot): void {
    const statements = this.getStatements();

    statements.paneGroups.deleteAllTabs.run();
    statements.paneGroups.deleteAll.run();
    statements.panes.deleteAll.run();
    statements.workspaces.deleteAll.run();
    statements.meta.deleteAll.run();

    for (const workspace of snapshot.workspaceRows) {
      statements.workspaces.insert.run({
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
      statements.panes.insert.run({
        $id: pane.id,
        $type: pane.type,
        $title: pane.title,
        $configJson: pane.configJson,
      });
    }

    for (const group of snapshot.paneGroupRows) {
      statements.paneGroups.insert.run({
        $id: group.id,
        $activeTabId: group.activeTabId,
      });

      for (const tab of group.tabs) {
        statements.paneGroups.insertTab.run({
          $id: tab.id,
          $groupId: tab.groupId,
          $paneId: tab.paneId,
          $position: tab.position,
        });
      }
    }

    statements.meta.insert.run({
      $key: "schema_version",
      $value: String(WORKSPACE_SCHEMA_VERSION),
    });
    statements.meta.insert.run({
      $key: "active_workspace_id",
      $value: snapshot.activeWorkspaceId,
    });
    statements.meta.insert.run({ $key: "sidebar_tree_json", $value: snapshot.sidebarTreeJson });
    statements.meta.insert.run({
      $key: "pinned_sidebar_nodes_json",
      $value: snapshot.pinnedSidebarNodesJson,
    });
  }

  private saveIncremental(
    previous: PreparedWorkspaceSnapshot,
    next: PreparedWorkspaceSnapshot,
  ): void {
    const previousWorkspaces = rowsById(previous.workspaceRows);
    const nextWorkspaces = rowsById(next.workspaceRows);
    const previousPanes = rowsById(previous.paneRows);
    const nextPanes = rowsById(next.paneRows);
    const previousGroups = rowsById(previous.paneGroupRows);
    const nextGroups = rowsById(next.paneGroupRows);
    const statements = this.getStatements();

    for (const previousWorkspace of previous.workspaceRows) {
      if (!nextWorkspaces.has(previousWorkspace.id)) {
        statements.workspaces.delete.run({ $id: previousWorkspace.id });
      }
    }

    for (const workspace of next.workspaceRows) {
      const previousWorkspace = previousWorkspaces.get(workspace.id);
      if (!previousWorkspace || !workspaceRowsEqual(previousWorkspace, workspace)) {
        statements.workspaces.upsert.run({
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
        statements.panes.delete.run({ $id: previousPane.id });
      }
    }

    for (const pane of next.paneRows) {
      const previousPane = previousPanes.get(pane.id);
      if (!previousPane || !paneRowsEqual(previousPane, pane)) {
        statements.panes.upsert.run({
          $id: pane.id,
          $type: pane.type,
          $title: pane.title,
          $configJson: pane.configJson,
        });
      }
    }

    for (const previousGroup of previous.paneGroupRows) {
      if (!nextGroups.has(previousGroup.id)) {
        statements.paneGroups.deleteTabsByGroupId.run({ $groupId: previousGroup.id });
        statements.paneGroups.delete.run({ $id: previousGroup.id });
      }
    }

    for (const group of next.paneGroupRows) {
      const previousGroup = previousGroups.get(group.id);
      if (!previousGroup || !paneGroupRowsEqual(previousGroup, group)) {
        statements.paneGroups.upsert.run({
          $id: group.id,
          $activeTabId: group.activeTabId,
        });
        statements.paneGroups.deleteTabsByGroupId.run({ $groupId: group.id });
        for (const tab of group.tabs) {
          statements.paneGroups.insertTab.run({
            $id: tab.id,
            $groupId: tab.groupId,
            $paneId: tab.paneId,
            $position: tab.position,
          });
        }
      }
    }

    statements.meta.upsert.run({
      $key: "schema_version",
      $value: String(WORKSPACE_SCHEMA_VERSION),
    });
    statements.meta.upsert.run({
      $key: "active_workspace_id",
      $value: next.activeWorkspaceId,
    });
    statements.meta.upsert.run({ $key: "sidebar_tree_json", $value: next.sidebarTreeJson });
    statements.meta.upsert.run({
      $key: "pinned_sidebar_nodes_json",
      $value: next.pinnedSidebarNodesJson,
    });
  }

  private getDirectoryPath(): string {
    const lastSlashIndex = this.filePath.lastIndexOf("/");
    return lastSlashIndex === -1 ? "." : this.filePath.slice(0, lastSlashIndex);
  }
}
