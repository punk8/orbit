import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { migrate } from "./migrate";
import { resolveOrbitDbPath, resolveOrbitHome } from "./orbitHome";

export interface OpenOrbitDatabaseOptions {
  orbitHome?: string;
  dbPath?: string;
  migrate?: boolean;
}

export interface OrbitDatabase {
  db: Database.Database;
  orbitHome: string;
  dbPath: string;
  close(): void;
}

export function openOrbitDatabase(options: OpenOrbitDatabaseOptions = {}): OrbitDatabase {
  const orbitHome = resolveOrbitHome(options.orbitHome);
  const dbPath = options.dbPath ?? resolveOrbitDbPath(orbitHome);
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("busy_timeout = 5000");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  if (options.migrate ?? true) {
    migrate(db);
  }

  return {
    db,
    orbitHome,
    dbPath,
    close: () => db.close()
  };
}
