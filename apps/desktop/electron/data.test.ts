import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  AuditRepository,
  openOrbitDatabase,
  readBackgroundRuntimeSnapshot,
  SettingsRepository,
  SourceRepository,
  writeBackgroundRuntimePolicy
} from "@orbit/db";
import { defaultPermissionScopeForSource } from "@orbit/core";
import {
  confirmSourceImportForDesktop,
  previewSourceImportForDesktop,
  setupSourceForDesktop,
  runBackgroundIngestionForDesktop
} from "./data";

const tempDirs: string[] = [];

afterEach(() => {
  delete process.env.ORBIT_HOME;
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("desktop background runtime ingestion", () => {
  it("previews an explicit local import without writing sources or events", async () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-desktop-preview-test-"));
    const codexHome = mkdtempSync(join(tmpdir(), "orbit-desktop-preview-codex-"));
    tempDirs.push(orbitHome);
    tempDirs.push(codexHome);
    process.env.ORBIT_HOME = orbitHome;
    writeCodexSession(codexHome, "Preview real local import.");

    const preview = await previewSourceImportForDesktop("codex", codexHome);

    expect(preview.mode).toBe("import_only");
    expect(preview.adapterId).toBe("codex_local");
    expect(preview.eventCount).toBeGreaterThan(0);
    expect(preview.path).toBe(codexHome);
    expect(preview.permission.canStoreRaw).toBe(false);
    expect(preview.permission.canExportToAgent).toBe(true);

    const database = openOrbitDatabase({ orbitHome });
    try {
      expect(new SourceRepository(database.db).countSources()).toBe(0);
    } finally {
      database.close();
    }
  });

  it("confirms explicit local imports as import-only and skips them in background ingestion", async () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-desktop-import-test-"));
    const codexHome = mkdtempSync(join(tmpdir(), "orbit-desktop-import-codex-"));
    tempDirs.push(orbitHome);
    tempDirs.push(codexHome);
    process.env.ORBIT_HOME = orbitHome;
    writeCodexSession(codexHome, "Import this session without enabling background sync.");

    const result = await confirmSourceImportForDesktop("codex", codexHome);

    expect(result.importResult.mode).toBe("import_only");
    expect(result.importResult.inserted).toBeGreaterThan(0);
    const config = result.snapshot.sourceAdapterConfigs.codex_local;
    expect(config).toBeDefined();
    expect(config?.mode).toBe("import_only");
    expect(config?.lastImport?.inserted).toBeGreaterThan(0);

    const background = await runBackgroundIngestionForDesktop();

    expect(background.attempted).toBe(0);
    expect(background.errors).toEqual([]);
    expect(background.skippedSources).toBeGreaterThanOrEqual(1);

    expect(config?.path).toBe(codexHome);
  });

  it("imports all events when the user switches an import-only source to a different path", async () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-desktop-import-switch-test-"));
    const firstCodexHome = mkdtempSync(join(tmpdir(), "orbit-desktop-import-switch-first-"));
    const secondCodexHome = mkdtempSync(join(tmpdir(), "orbit-desktop-import-switch-second-"));
    tempDirs.push(orbitHome);
    tempDirs.push(firstCodexHome);
    tempDirs.push(secondCodexHome);
    process.env.ORBIT_HOME = orbitHome;
    writeCodexSession(firstCodexHome, "First explicit import.", "first-session");
    writeCodexSession(
      secondCodexHome,
      "Second explicit import should not inherit the old cursor.",
      "second-session"
    );

    const first = await confirmSourceImportForDesktop("codex", firstCodexHome);
    const second = await confirmSourceImportForDesktop("codex", secondCodexHome);

    expect(first.importResult.inserted).toBe(2);
    expect(first.importResult.nextCursor).toBe("2");
    expect(second.importResult.read).toBe(2);
    expect(second.importResult.inserted).toBe(2);
    expect(second.importResult.path).toBe(secondCodexHome);
  });

  it("schedules sources independently, audits skips, and backs off only failing sources", async () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-desktop-runtime-test-"));
    const codexHome = mkdtempSync(join(tmpdir(), "orbit-desktop-runtime-codex-"));
    tempDirs.push(orbitHome);
    tempDirs.push(codexHome);
    process.env.ORBIT_HOME = orbitHome;
    writeCodexSession(codexHome, "Validate background ingestion.");

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
      new SettingsRepository(database.db).set("sources.adapterConfigs", {
        codex_local: {
          setupKind: "codex",
          mode: "syncable",
          path: codexHome
        },
        seatalk_missing_config: {
          setupKind: "seatalk",
          mode: "syncable"
        }
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

function writeCodexSession(codexHome: string, text: string, sessionId = "runtime-test"): void {
  writeFileSync(
    join(codexHome, "session.jsonl"),
    [
      {
        timestamp: "2026-05-22T09:00:00.000Z",
        type: "session_meta",
        payload: {
          id: sessionId,
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
          content: [{ type: "input_text", text }]
        }
      }
    ]
      .map((record) => JSON.stringify(record))
      .join("\n")
  );
}
