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

const busyTimeoutMs = 10_000;
const activeMigrationPaths = new Set<string>();

export function openOrbitDatabase(options: OpenOrbitDatabaseOptions = {}): OrbitDatabase {
  const orbitHome = resolveOrbitHome(options.orbitHome);
  const dbPath = options.dbPath ?? resolveOrbitDbPath(orbitHome);
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma(`busy_timeout = ${busyTimeoutMs}`);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  if (options.migrate ?? true) {
    migrateWithProcessGuard(dbPath, () => migrate(db));
  }

  return {
    db,
    orbitHome,
    dbPath,
    close: () => db.close()
  };
}

function migrateWithProcessGuard(dbPath: string, run: () => void): void {
  if (activeMigrationPaths.has(dbPath)) {
    return;
  }

  activeMigrationPaths.add(dbPath);
  try {
    run();
  } finally {
    activeMigrationPaths.delete(dbPath);
  }
}
