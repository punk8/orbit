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
const initialPragmaRetries = 20;
const initialPragmaRetryMs = 50;
const activeMigrationPaths = new Set<string>();

export function openOrbitDatabase(options: OpenOrbitDatabaseOptions = {}): OrbitDatabase {
  const orbitHome = resolveOrbitHome(options.orbitHome);
  const dbPath = options.dbPath ?? resolveOrbitDbPath(orbitHome);
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  runInitialPragmaWithRetry(() => db.pragma(`busy_timeout = ${busyTimeoutMs}`));
  runInitialPragmaWithRetry(() => db.pragma("journal_mode = WAL"));
  runInitialPragmaWithRetry(() => db.pragma("foreign_keys = ON"));

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

function runInitialPragmaWithRetry(run: () => void): void {
  let lastError: unknown;
  for (let attempt = 0; attempt <= initialPragmaRetries; attempt += 1) {
    try {
      run();
      return;
    } catch (error) {
      lastError = error;
      if (!isSqliteBusy(error) || attempt === initialPragmaRetries) {
        throw error;
      }
      sleepSync(initialPragmaRetryMs);
    }
  }
  throw lastError;
}

function isSqliteBusy(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "code" in error && error.code === "SQLITE_BUSY"
  );
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
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
