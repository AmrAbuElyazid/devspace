type SqliteStatement = {
  get: (params?: Record<string, unknown>) => Record<string, unknown> | undefined;
  run: (params?: Record<string, unknown>) => unknown;
};

type SqliteDatabase = {
  exec: (sql: string) => void;
  prepare: (sql: string) => SqliteStatement;
};

type WorkspaceMigration = {
  version: number;
  apply: (db: SqliteDatabase) => void;
};

export const WORKSPACE_SCHEMA_VERSION = 1;

const WORKSPACE_MIGRATIONS: WorkspaceMigration[] = [
  {
    version: 1,
    apply(db) {
      db.exec(`
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
    },
  },
];

function ensureMetaTable(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
}

function readSchemaVersion(db: SqliteDatabase): number {
  const row = db.prepare(`SELECT value FROM meta WHERE key = $key`).get({ $key: "schema_version" });

  if (row === undefined) {
    return 0;
  }

  const rawValue = row["value"];
  const parsed = Number.parseInt(typeof rawValue === "string" ? rawValue : String(rawValue), 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid workspace schema version: ${String(rawValue)}`);
  }

  return parsed;
}

function writeSchemaVersion(db: SqliteDatabase, version: number): void {
  db.prepare(
    `INSERT INTO meta (key, value)
     VALUES ($key, $value)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run({
    $key: "schema_version",
    $value: String(version),
  });
}

export function runWorkspaceMigrations(db: SqliteDatabase): void {
  ensureMetaTable(db);

  const currentVersion = readSchemaVersion(db);
  if (currentVersion > WORKSPACE_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported workspace schema version ${currentVersion}; expected <= ${WORKSPACE_SCHEMA_VERSION}`,
    );
  }
  if (currentVersion === WORKSPACE_SCHEMA_VERSION) {
    return;
  }

  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    for (const migration of WORKSPACE_MIGRATIONS) {
      if (migration.version <= currentVersion) {
        continue;
      }
      migration.apply(db);
      writeSchemaVersion(db, migration.version);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
