import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type { SourceKind, SourceRecord } from "@orbit/core";
import {
  defaultPermissionScopeForSource,
  DEFAULT_BACKGROUND_RUNTIME_POLICY
} from "@orbit/core";
import { openOrbitDatabase } from "./connection";
import { readBackgroundRuntimeSnapshot, writeBackgroundSourceRuntimeState } from "./backgroundRuntimeStore";
import { SourceRepository } from "./repositories/sourceRepository";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("background runtime store", () => {
  it("persists per-source schedule state and exposes next run/error status in source order", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-runtime-store-test-"));
    tempDirs.push(orbitHome);
    const { db, close } = openOrbitDatabase({ orbitHome });
    try {
      const sources = new SourceRepository(db);
      sources.upsertSource(makeSource("fixture_codex", "codex"));
      sources.upsertSource(makeSource("fixture_seatalk", "seatalk"));

      writeBackgroundSourceRuntimeState(db, {
        sourceId: "fixture_codex",
        intervalMs: 60_000,
        consecutiveFailures: 0,
        lastRunAt: "2026-05-22T10:00:00.000Z",
        lastSuccessAt: "2026-05-22T10:00:01.000Z",
        nextRunAt: "2026-05-22T10:01:00.000Z"
      });
      writeBackgroundSourceRuntimeState(db, {
        sourceId: "fixture_seatalk",
        intervalMs: 300_000,
        consecutiveFailures: 2,
        lastRunAt: "2026-05-22T10:00:00.000Z",
        lastErrorAt: "2026-05-22T10:00:02.000Z",
        lastError: "adapter unavailable",
        backoffUntil: "2026-05-22T10:04:00.000Z",
        nextRunAt: "2026-05-22T10:04:00.000Z"
      });

      const snapshot = readBackgroundRuntimeSnapshot(db);

      expect(snapshot.policy.defaultIntervalMs).toBe(
        DEFAULT_BACKGROUND_RUNTIME_POLICY.defaultIntervalMs
      );
      expect(snapshot.sources.map((source) => source.sourceId)).toEqual([
        "fixture_codex",
        "fixture_seatalk"
      ]);
      expect(snapshot.sources[0]).toMatchObject({
        sourceId: "fixture_codex",
        status: "scheduled",
        nextRunAt: "2026-05-22T10:01:00.000Z",
        lastSuccessAt: "2026-05-22T10:00:01.000Z"
      });
      expect(snapshot.sources[1]).toMatchObject({
        sourceId: "fixture_seatalk",
        status: "backoff",
        lastError: "adapter unavailable",
        backoffUntil: "2026-05-22T10:04:00.000Z"
      });
    } finally {
      close();
    }
  });
});

function makeSource(id: string, kind: SourceKind): SourceRecord {
  const now = "2026-05-22T09:00:00.000Z";
  return {
    id,
    kind,
    displayName: id,
    enabled: true,
    paused: false,
    defaultSensitivity: "internal",
    permissionScope: defaultPermissionScopeForSource(kind, "internal"),
    createdAt: now,
    updatedAt: now
  };
}
