import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { getAppliedMigrations, openOrbitDatabase } from "./index";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("database connection concurrency", () => {
  it("opens and migrates a fresh database from parallel callers", async () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-db-concurrency-"));
    tempDirs.push(orbitHome);

    const opened = await Promise.all(
      Array.from({ length: 8 }, async () => openOrbitDatabase({ orbitHome }))
    );

    try {
      for (const database of opened) {
        expect(getAppliedMigrations(database.db)).toEqual([
          "0001_initial",
          "0002_source_runtime",
          "0003_source_permissions",
          "0004_memory_replication_metadata"
        ]);
        expect(database.db.pragma("busy_timeout", { simple: true })).toBeGreaterThanOrEqual(10_000);
        expect(database.db.pragma("foreign_keys", { simple: true })).toBe(1);
      }
    } finally {
      for (const database of opened) {
        database.close();
      }
    }
  });
});
