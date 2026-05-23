import type Database from "better-sqlite3";

export const migration0005 = {
  id: "0005_memory_version_history",
  up(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS memory_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        snapshot_json TEXT NOT NULL,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_memory_versions_memory_id_version
        ON memory_versions(memory_id, version);
    `);
  }
};
