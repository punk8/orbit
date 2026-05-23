import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  AuditRepository,
  openOrbitDatabase,
  readBackgroundRuntimeSnapshot,
  SourceRepository,
  writeBackgroundRuntimePolicy
} from "@orbit/db";
import { defaultPermissionScopeForSource } from "@orbit/core";
import { setupSourceForDesktop, runBackgroundIngestionForDesktop } from "./data";

const tempDirs: string[] = [];

afterEach(() => {
  delete process.env.ORBIT_HOME;
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("desktop background runtime ingestion", () => {
  it("schedules sources independently, audits skips, and backs off only failing sources", async () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-desktop-runtime-test-"));
    const codexHome = mkdtempSync(join(tmpdir(), "orbit-desktop-runtime-codex-"));
    tempDirs.push(orbitHome);
    tempDirs.push(codexHome);
    process.env.ORBIT_HOME = orbitHome;
    writeFileSync(
      join(codexHome, "session.jsonl"),
      [
        {
          timestamp: "2026-05-22T09:00:00.000Z",
          type: "session_meta",
          payload: {
            id: "runtime-test",
            cwd: "/Users/example/Documents/project/orbit",
            source: "Codex Desktop"
          }
        },
        {
          timestamp: "2026-05-22T09:01:00.000Z",
          type: "response_item",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "Validate background ingestion." }]
          }
        }
      ]
        .map((record) => JSON.stringify(record))
        .join("\n")
    );

    await setupSourceForDesktop("codex", codexHome);

    const database = openOrbitDatabase({ orbitHome });
    try {
      writeBackgroundRuntimePolicy(database.db, {
        perSourceIntervalMs: {
          codex: 60_000,
          seatalk: 60_000
        }
      });
      const sources = new SourceRepository(database.db);
      sources.upsertSource({
        id: "seatalk_missing_config",
        kind: "seatalk",
        displayName: "SeaTalk Missing Config",
        enabled: true,
        paused: false,
        defaultSensitivity: "confidential",
        permissionScope: defaultPermissionScopeForSource("seatalk", "confidential"),
        createdAt: "2026-05-22T09:00:00.000Z",
        updatedAt: "2026-05-22T09:00:00.000Z"
      });
    } finally {
      database.close();
    }

    const first = await runBackgroundIngestionForDesktop();

    expect(first.attempted).toBe(2);
    expect(first.errors).toHaveLength(1);
    expect(first.errors[0]).toContain("SeaTalk Missing Config");

    const second = await runBackgroundIngestionForDesktop();
    expect(second.attempted).toBe(0);
    expect(second.skippedSources).toBeGreaterThanOrEqual(2);

    const inspect = openOrbitDatabase({ orbitHome });
    try {
      const snapshot = readBackgroundRuntimeSnapshot(inspect.db);
      expect(snapshot.sources.find((source) => source.sourceId === "codex_local")?.status).toBe(
        "scheduled"
      );
      expect(
        snapshot.sources.find((source) => source.sourceId === "seatalk_missing_config")?.status
      ).toBe("backoff");
      const operations = new AuditRepository(inspect.db).listAuditLogs().map((log) => log.operation);
      expect(operations).toContain("source.ingest_failed");
      expect(operations).toContain("source.skip");
    } finally {
      inspect.close();
    }
  });
});
