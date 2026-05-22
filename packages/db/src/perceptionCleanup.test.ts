import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Event, SourceRecord } from "@orbit/core";
import { hashObject } from "@orbit/core";
import { openOrbitDatabase } from "./connection";
import { cleanupPerceptionSidecars } from "./perceptionCleanup";
import { AuditRepository } from "./repositories/auditRepository";
import { EventRepository } from "./repositories/eventRepository";
import { SourceRepository } from "./repositories/sourceRepository";
import { updatePerceptionSourcePolicy } from "./perceptionSettings";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("perception sidecar cleanup", () => {
  it("removes expired raw sidecars while preserving summaries and evidence pointers", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-perception-cleanup-test-"));
    tempDirs.push(orbitHome);
    const sidecarDir = join(orbitHome, "perception-sidecars");
    mkdirSync(sidecarDir, { recursive: true });
    const rawPath = join(sidecarDir, "frame.png");
    writeFileSync(rawPath, "mock raw frame");
    const database = openOrbitDatabase({ orbitHome });

    try {
      updatePerceptionSourcePolicy(database.db, "screen", {
        canStoreRaw: true,
        rawRetentionTtlMinutes: 1
      });
      new SourceRepository(database.db).upsertSource(makePerceptionSource());
      new EventRepository(database.db).upsertEvent(makeRawScreenEvent(rawPath));

      const result = cleanupPerceptionSidecars(database, {
        now: "2026-05-21T00:05:00.000Z"
      });

      expect(result.cleanedEvents).toBe(1);
      expect(result.removedRawRefs).toBe(1);
      expect(result.removedAttachments).toBe(1);
      expect(result.deletedLocalSidecars).toBe(1);
      expect(result.ledgerPath).toContain("cleanup-ledger.jsonl");
      expect(result.ledgerEntries).toEqual([
        expect.objectContaining({
          eventId: "evt_raw_screen",
          sourcePointer: "screen://capture/frame",
          reason: "raw_ttl_expired",
          deletedLocalSidecars: 1,
          removedRawRefs: 1,
          removedAttachments: 1
        })
      ]);
      expect(result.preservedSummaries).toBe(1);
      expect(existsSync(rawPath)).toBe(false);
      expect(readFileSync(result.ledgerPath!, "utf8")).toContain("raw_ttl_expired");
      expect(readFileSync(result.ledgerPath!, "utf8")).not.toContain(rawPath);

      const stored = new EventRepository(database.db).getEvent("evt_raw_screen");
      expect(stored?.content.rawRef).toBeUndefined();
      expect(stored?.content.attachments).toBeUndefined();
      expect(stored?.content.summary).toContain("Raw frame text");
      expect(stored?.source.pointer).toBe("screen://capture/frame");
      expect(stored?.privacy.redactionState).toBe("redacted");
      expect(new AuditRepository(database.db).listAuditLogs().map((log) => log.operation)).toContain(
        "perception.sidecar_cleanup"
      );
    } finally {
      database.close();
    }
  });
});

function makePerceptionSource(): SourceRecord {
  return {
    id: "perception_screen",
    kind: "screen",
    displayName: "Screen Observation",
    enabled: true,
    paused: false,
    defaultSensitivity: "confidential",
    permissionScope: {
      sourceKind: "screen",
      readableFields: ["summary", "timestamp", "app"],
      canStoreRaw: true,
      canStoreSummary: true,
      canUseForAI: false,
      canExportToAgent: false,
      retentionPolicyId: "perception_raw_ttl_1m"
    },
    createdAt: "2026-05-21T00:00:00.000Z",
    updatedAt: "2026-05-21T00:00:00.000Z"
  };
}

function makeRawScreenEvent(rawPath: string): Event {
  return {
    id: "evt_raw_screen",
    schemaVersion: 1,
    source: {
      kind: "screen",
      adapterId: "perception_screen",
      externalId: "frame",
      pointer: "screen://capture/frame"
    },
    occurredAt: "2026-05-21T00:00:00.000Z",
    observedAt: "2026-05-21T00:00:00.000Z",
    context: {
      app: "Orbit",
      windowTitle: "Alpha"
    },
    type: "screen_observation",
    content: {
      title: "Screen observation in Orbit",
      text: "Raw frame text that should be minimized into a summary.",
      rawRef: rawPath,
      attachments: [
        {
          id: "frame_hash",
          kind: "image",
          localRef: rawPath,
          sourcePointer: "screen://capture/frame",
          hash: "frame_hash"
        }
      ]
    },
    privacy: {
      sensitivity: "confidential",
      retentionPolicyId: "perception_raw_ttl_1m",
      redactionState: "none"
    },
    hash: hashObject({ id: "evt_raw_screen", rawPath })
  };
}
