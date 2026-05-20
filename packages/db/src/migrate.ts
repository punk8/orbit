import type Database from "better-sqlite3";
import { migration0001 } from "./migrations/0001_initial";

const migrations = [migration0001];

export function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    db
      .prepare("SELECT id FROM schema_migrations")
      .all()
      .map((row) => (row as { id: string }).id)
  );

  for (const migration of migrations) {
    if (applied.has(migration.id)) {
      continue;
    }

    const transaction = db.transaction(() => {
      migration.up(db);
      db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(
        migration.id,
        new Date().toISOString()
      );
    });
    transaction();
  }
}

export function getAppliedMigrations(db: Database.Database): string[] {
  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
    .get();
  if (!table) {
    return [];
  }

  return db
    .prepare("SELECT id FROM schema_migrations ORDER BY id")
    .all()
    .map((row) => (row as { id: string }).id);
}
