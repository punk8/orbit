import type Database from "better-sqlite3";

export const migration0004 = {
  id: "0004_memory_replication_metadata",
  up(db: Database.Database): void {
    addColumnIfMissing(db, "memories", "dimension", "TEXT");
    addColumnIfMissing(db, "memories", "source_session_ids_json", "TEXT");
    addColumnIfMissing(db, "memories", "version", "INTEGER NOT NULL DEFAULT 1");
    addColumnIfMissing(db, "memories", "index_state_json", "TEXT");
  }
};

function addColumnIfMissing(
  db: Database.Database,
  tableName: string,
  columnName: string,
  definition: string
): void {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  if (columns.some((column) => column.name === columnName)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}
