import { mkdirSync } from "fs";
import { join } from "path";
import { DatabaseSync } from "node:sqlite";
import type { PersistedWorkspaceState } from "../shared/workspace-persistence";
import {
  createWorkspacePersistenceStatements,
  type SqliteDatabase,
  type WorkspacePersistenceStatements,
} from "./workspace-persistence-statements";
import {
  loadPersistedWorkspaceState,
  prepareSnapshot,
  saveFullWorkspaceSnapshot,
  saveIncrementalWorkspaceSnapshot,
  type PreparedWorkspaceSnapshot,
} from "./workspace-persistence-state";
import { runWorkspaceMigrations } from "./workspace-persistence-migrations";

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
    try {
      const snapshot = loadPersistedWorkspaceState(this.getStatements());
      if (!snapshot) {
        this.lastSavedSnapshot = null;
        return null;
      }

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
    saveFullWorkspaceSnapshot(this.getStatements(), snapshot);
  }

  private saveIncremental(
    previous: PreparedWorkspaceSnapshot,
    next: PreparedWorkspaceSnapshot,
  ): void {
    saveIncrementalWorkspaceSnapshot(this.getStatements(), previous, next);
  }

  private getDirectoryPath(): string {
    const lastSlashIndex = this.filePath.lastIndexOf("/");
    return lastSlashIndex === -1 ? "." : this.filePath.slice(0, lastSlashIndex);
  }
}
