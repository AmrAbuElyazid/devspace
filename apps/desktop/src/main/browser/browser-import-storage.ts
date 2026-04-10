import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

type ReadonlyDatabase = {
  query: (sql: string) => Array<Record<string, unknown>>;
  close: () => void;
};

export function copyDatabaseToTemp(dbPath: string): { dbPath: string; cleanup: () => void } {
  const tempDir = mkdtempSync(join(tmpdir(), "devspace-browser-import-"));
  const tempDbPath = join(tempDir, basename(dbPath));

  copyFileSync(dbPath, tempDbPath);
  copyOptionalSidecar(dbPath, tempDbPath, "-wal");
  copyOptionalSidecar(dbPath, tempDbPath, "-shm");

  return {
    dbPath: tempDbPath,
    cleanup: () => {
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

export function copyFileToTemp(filePath: string): { filePath: string; cleanup: () => void } {
  const tempDir = mkdtempSync(join(tmpdir(), "devspace-browser-import-"));
  const tempFilePath = join(tempDir, basename(filePath));
  copyFileSync(filePath, tempFilePath);

  return {
    filePath: tempFilePath,
    cleanup: () => {
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

export async function queryDatabaseRows(
  dbPath: string,
  sql: string,
): Promise<Array<Record<string, unknown>>> {
  const snapshot = copyDatabaseToTemp(dbPath);

  try {
    const db = await openReadonlyDatabase(snapshot.dbPath);
    try {
      return db.query(sql);
    } finally {
      db.close();
    }
  } finally {
    snapshot.cleanup();
  }
}

export async function readChromiumMetaVersion(dbPath: string): Promise<number> {
  const db = await openReadonlyDatabase(dbPath);

  try {
    const rows = db.query(`SELECT value FROM meta WHERE key = 'version' LIMIT 1`);
    const value = rows[0]?.value;
    return asNumber(value) ?? 0;
  } catch (err) {
    console.warn("[browser-import] Chromium meta version query failed:", err);
    return 0;
  } finally {
    db.close();
  }
}

export async function queryCookieDb(dbPath: string): Promise<Array<Record<string, unknown>>> {
  const db = await openReadonlyDatabase(dbPath);

  try {
    return db.query(
      "SELECT name, value, host_key, path, CAST(expires_utc AS TEXT) AS expires_utc, samesite, encrypted_value, is_secure, is_httponly FROM cookies ORDER BY expires_utc DESC",
    );
  } finally {
    db.close();
  }
}

async function openReadonlyDatabase(dbPath: string): Promise<ReadonlyDatabase> {
  if ("Bun" in globalThis) {
    const bunSqlite = await importBunSqlite();
    const db = new bunSqlite.Database(dbPath, { readonly: true });
    return {
      query: (sql) => db.query(sql).all() as Array<Record<string, unknown>>,
      close: () => db.close(),
    };
  }

  const nodeSqlite = await import("node:sqlite");
  const db = new nodeSqlite.DatabaseSync(dbPath, { readOnly: true, readBigInts: true });
  return {
    query: (sql) => db.prepare(sql).all() as Array<Record<string, unknown>>,
    close: () => db.close(),
  };
}

function copyOptionalSidecar(sourceDbPath: string, tempDbPath: string, suffix: string): void {
  const sidecarPath = `${sourceDbPath}${suffix}`;
  if (!existsSync(sidecarPath)) {
    return;
  }

  try {
    copyFileSync(sidecarPath, `${tempDbPath}${suffix}`);
  } catch (err) {
    console.warn(`[browser-import] Sidecar copy (${suffix}) failed:`, err);
  }
}

async function importBunSqlite(): Promise<{
  Database: new (
    path: string,
    options: { readonly: boolean },
  ) => {
    query: (sql: string) => { all: () => Array<Record<string, unknown>> };
    close: () => void;
  };
}> {
  return (0, eval)("import('bun:sqlite')") as Promise<{
    Database: new (
      path: string,
      options: { readonly: boolean },
    ) => {
      query: (sql: string) => { all: () => Array<Record<string, unknown>> };
      close: () => void;
    };
  }>;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "bigint") {
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
  }

  if (typeof value === "string") {
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
  }

  return null;
}
