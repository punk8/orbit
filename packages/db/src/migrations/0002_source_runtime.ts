import type Database from "better-sqlite3";

export const migration0002 = {
  id: "0002_source_runtime",
  up(db: Database.Database): void {
    addColumnIfMissing(db, "sources", "paused", "INTEGER NOT NULL DEFAULT 0");
    addColumnIfMissing(db, "sources", "last_sync_at", "TEXT");
    addColumnIfMissing(db, "sources", "last_event_at", "TEXT");
    addColumnIfMissing(db, "sources", "last_error", "TEXT");
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
