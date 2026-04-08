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

const SCHEMA_VERSION = "1";

export class WorkspacePersistenceStore {
  private readonly filePath: string;
  private db: SqliteDatabase | null = null;

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

      return {
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
    } catch (error) {
      console.warn("[WorkspacePersistenceStore] Failed to read workspace state:", error);
      return null;
    }
  }

  save(snapshot: PersistedWorkspaceState): void {
    const db = this.getDb();
    db.exec("BEGIN IMMEDIATE TRANSACTION");

    try {
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

      for (const workspace of snapshot.workspaces) {
        insertWorkspace.run({
          $id: workspace.id,
          $name: workspace.name,
          $focusedGroupId: workspace.focusedGroupId,
          $zoomedGroupId: workspace.zoomedGroupId,
          $lastActiveAt: workspace.lastActiveAt,
          $lastTerminalCwd: workspace.lastTerminalCwd ?? null,
          $rootJson: JSON.stringify(workspace.root),
        });
      }

      for (const pane of Object.values(snapshot.panes)) {
        insertPane.run({
          $id: pane.id,
          $type: pane.type,
          $title: pane.title,
          $configJson: JSON.stringify(pane.config),
        });
      }

      for (const group of Object.values(snapshot.paneGroups)) {
        insertPaneGroup.run({
          $id: group.id,
          $activeTabId: group.activeTabId,
        });

        group.tabs.forEach((tab, index) => {
          insertPaneGroupTab.run({
            $id: tab.id,
            $groupId: group.id,
            $paneId: tab.paneId,
            $position: index,
          });
        });
      }

      insertMeta.run({ $key: "schema_version", $value: SCHEMA_VERSION });
      insertMeta.run({ $key: "active_workspace_id", $value: snapshot.activeWorkspaceId });
      insertMeta.run({
        $key: "sidebar_tree_json",
        $value: JSON.stringify(snapshot.sidebarTree),
      });
      insertMeta.run({
        $key: "pinned_sidebar_nodes_json",
        $value: JSON.stringify(snapshot.pinnedSidebarNodes),
      });

      db.exec("COMMIT");
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

  private getDirectoryPath(): string {
    const lastSlashIndex = this.filePath.lastIndexOf("/");
    return lastSlashIndex === -1 ? "." : this.filePath.slice(0, lastSlashIndex);
  }
}
