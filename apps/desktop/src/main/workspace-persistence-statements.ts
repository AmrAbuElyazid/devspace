export type SqliteStatement = {
  all: (params?: Record<string, unknown>) => Array<Record<string, unknown>>;
  get: (params?: Record<string, unknown>) => Record<string, unknown> | undefined;
  run: (params?: Record<string, unknown>) => unknown;
};

export type SqliteDatabase = {
  exec: (sql: string) => void;
  prepare: (sql: string) => SqliteStatement;
  close: () => void;
};

export type WorkspacePersistenceStatements = {
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

export function createWorkspacePersistenceStatements(
  db: SqliteDatabase,
): WorkspacePersistenceStatements {
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
