import type Database from "better-sqlite3";

export const migration0003 = {
  id: "0003_source_permissions",
  up(db: Database.Database): void {
    addColumnIfMissing(db, "sources", "permission_scope_json", "TEXT");
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
