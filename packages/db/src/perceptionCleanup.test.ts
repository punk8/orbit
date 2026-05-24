import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Event, SourceRecord } from "@orbit/core";
import { hashObject } from "@orbit/core";
import { openOrbitDatabase } from "./connection";
import { cleanupPerceptionSidecars, deletePerceptionSourceEvents } from "./perceptionCleanup";
import { AuditRepository } from "./repositories/auditRepository";
import { EventRepository } from "./repositories/eventRepository";
import { KnowledgeRepository } from "./repositories/knowledgeRepository";
import { MemoryRepository } from "./repositories/memoryRepository";
import { RecommendationRepository } from "./repositories/recommendationRepository";
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

  it("retains raw sidecars until their local storage TTL expires", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-perception-cleanup-stored-at-test-"));
    tempDirs.push(orbitHome);
    const sidecarDir = join(orbitHome, "perception-sidecars");
    mkdirSync(sidecarDir, { recursive: true });
    const rawPath = join(sidecarDir, "historical-frame.png");
    writeFileSync(rawPath, "mock historical raw frame");
    const database = openOrbitDatabase({ orbitHome });

    try {
      updatePerceptionSourcePolicy(database.db, "screen", {
        canStoreRaw: true,
        rawRetentionTtlMinutes: 72 * 60
      });
      new SourceRepository(database.db).upsertSource(makePerceptionSource());
      new EventRepository(database.db).upsertEvent(
        makeRawScreenEvent(rawPath, {
          occurredAt: "2026-05-21T00:00:00.000Z",
          rawFrameStoredAt: "2026-05-24T08:00:00.000Z"
        })
      );

      const result = cleanupPerceptionSidecars(database, {
        now: "2026-05-24T09:00:00.000Z"
      });

      expect(result.cleanedEvents).toBe(0);
      expect(result.retainedRawSidecars).toBe(1);
      expect(existsSync(rawPath)).toBe(true);
      expect(new EventRepository(database.db).getEvent("evt_raw_screen")?.content.rawRef).toBe(
        rawPath
      );
    } finally {
      database.close();
    }
  });

  it("deletes source-derived events by time range while preserving derived summaries with unavailable evidence state", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-perception-delete-events-test-"));
    tempDirs.push(orbitHome);
    const database = openOrbitDatabase({ orbitHome });
    try {
      const events = new EventRepository(database.db);
      const knowledge = new KnowledgeRepository(database.db);
      const memory = new MemoryRepository(database.db);
      const recommendations = new RecommendationRepository(database.db);
      new SourceRepository(database.db).upsertSource(makePerceptionSource());
      const inRange = makeRawScreenEvent("/not-used/in-range.png");
      const outOfRange = {
        ...makeRawScreenEvent("/not-used/out-of-range.png"),
        id: "evt_raw_screen_out_of_range",
        occurredAt: "2026-05-21T02:00:00.000Z",
        observedAt: "2026-05-21T02:00:00.000Z",
        hash: hashObject({ id: "evt_raw_screen_out_of_range" })
      };
      events.upsertEvent(inRange);
      events.upsertEvent(outOfRange);
      knowledge.upsertKnowledgeArtifact(makeDerivedKnowledge(inRange));
      memory.upsertMemory(makeDerivedMemory(inRange));
      recommendations.upsertRecommendation(makeDerivedRecommendation(inRange));

      const dryRun = deletePerceptionSourceEvents(database, {
        sourceKind: "screen",
        from: "2026-05-21T00:00:00.000Z",
        to: "2026-05-21T01:00:00.000Z",
        dryRun: true
      });
      expect(dryRun.matchedEvents).toBe(1);
      expect(dryRun.deletedEvents).toBe(0);
      expect(events.getEvent(inRange.id)).toBeTruthy();

      const result = deletePerceptionSourceEvents(database, {
        sourceKind: "screen",
        from: "2026-05-21T00:00:00.000Z",
        to: "2026-05-21T01:00:00.000Z"
      });

      expect(result).toMatchObject({
        dryRun: false,
        sourceKind: "screen",
        matchedEvents: 1,
        deletedEvents: 1,
        preservedKnowledge: 1,
        preservedMemories: 1,
        preservedRecommendations: 1,
        rebuild: expect.objectContaining({
          status: "completed",
          pipeline: expect.any(Object)
        })
      });
      expect(events.getEvent(inRange.id)).toBeUndefined();
      expect(events.getEvent(outOfRange.id)).toBeTruthy();
      expect(knowledge.getKnowledgeArtifact("kn_delete_preserve")?.metadata).toMatchObject({
        evidenceState: "unavailable",
        evidenceUnavailableReason: "source_events_deleted"
      });
      expect(knowledge.getKnowledgeArtifact("kn_delete_preserve")?.evidence).toEqual([
        expect.objectContaining({
          sourcePointer: "screen://capture/frame",
          sourceKind: "screen"
        })
      ]);
      expect(knowledge.getKnowledgeArtifact("kn_delete_preserve")?.evidence[0]?.eventId).toBeUndefined();
      expect(memory.getMemory("mem_delete_preserve")?.evidence[0]?.eventId).toBeUndefined();
      expect(
        recommendations.getRecommendation("rec_delete_preserve")?.evidence[0]?.eventId
      ).toBeUndefined();
      const auditOperations = new AuditRepository(database.db)
        .listAuditLogs()
        .map((log) => log.operation);
      expect(auditOperations).toContain("perception.events_delete");
      expect(auditOperations).toContain("perception.evidence_unavailable");
      const eventsDeleteAudit = new AuditRepository(database.db)
        .listAuditLogs()
        .find((log) => log.operation === "perception.events_delete");
      expect(eventsDeleteAudit).toBeTruthy();
      const auditPayload = JSON.stringify(eventsDeleteAudit?.details);
      expect(auditPayload).not.toContain(inRange.id);
      expect(auditPayload).not.toContain(inRange.source.pointer);
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

function makeRawScreenEvent(
  rawPath: string,
  overrides: { occurredAt?: string; rawFrameStoredAt?: string } = {}
): Event {
  const occurredAt = overrides.occurredAt ?? "2026-05-21T00:00:00.000Z";
  return {
    id: "evt_raw_screen",
    schemaVersion: 1,
    source: {
      kind: "screen",
      adapterId: "perception_screen",
      externalId: "frame",
      pointer: "screen://capture/frame"
    },
    occurredAt,
    observedAt: occurredAt,
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
      ],
      metadata: {
        ...(overrides.rawFrameStoredAt ? { rawFrameStoredAt: overrides.rawFrameStoredAt } : {})
      }
    },
    privacy: {
      sensitivity: "confidential",
      retentionPolicyId: "perception_raw_ttl_1m",
      redactionState: "none"
    },
    hash: hashObject({ id: "evt_raw_screen", rawPath })
  };
}

function makeDerivedKnowledge(event: Event) {
  return {
    id: "kn_delete_preserve",
    schemaVersion: 1,
    type: "daily_brief" as const,
    title: "Screen-derived Knowledge",
    status: "confirmed" as const,
    metadata: {
      apps: ["Orbit"],
      projects: ["orbit"],
      sourceSessionIds: ["act_delete_preserve"]
    },
    content: {
      description: "Derived summary should remain after source Event deletion.",
      keyInsights: ["Keep summary, mark evidence unavailable."],
      markdown: "# Screen-derived Knowledge\n\nKeep summary, mark evidence unavailable."
    },
    evidence: [
      {
        eventId: event.id,
        sourceKind: event.source.kind,
        sourcePointer: event.source.pointer,
        timestamp: event.occurredAt,
        excerpt: "Safe derived excerpt"
      }
    ],
    confidence: 0.8,
    createdAt: "2026-05-21T00:05:00.000Z",
    updatedAt: "2026-05-21T00:05:00.000Z"
  };
}

function makeDerivedMemory(event: Event) {
  return {
    id: "mem_delete_preserve",
    schemaVersion: 1,
    kind: "project_fact" as const,
    dimension: "project" as const,
    title: "Screen-derived Memory",
    body: "A derived memory should remain reviewable.",
    status: "confirmed" as const,
    scope: { project: "orbit", sourceKinds: ["screen" as const] },
    sourceSessionIds: ["act_delete_preserve"],
    tags: ["screen"],
    evidence: [
      {
        eventId: event.id,
        sourceKind: event.source.kind,
        sourcePointer: event.source.pointer,
        timestamp: event.occurredAt
      }
    ],
    confidence: 0.7,
    version: 1,
    indexState: {
      provider: "fts" as const,
      status: "indexed" as const,
      fallbackOrder: ["local_embedding" as const, "local_endpoint" as const, "fts" as const]
    },
    createdAt: "2026-05-21T00:06:00.000Z",
    updatedAt: "2026-05-21T00:06:00.000Z"
  };
}

function makeDerivedRecommendation(event: Event) {
  return {
    id: "rec_delete_preserve",
    schemaVersion: 1,
    type: "follow_up" as const,
    title: "Review deleted source evidence",
    explanation: "The derived recommendation should survive source event deletion.",
    suggestedAction: "Review the preserved summary.",
    confidence: 0.7,
    impact: "medium" as const,
    status: "new" as const,
    evidence: [
      {
        eventId: event.id,
        sourceKind: event.source.kind,
        sourcePointer: event.source.pointer,
        timestamp: event.occurredAt
      }
    ],
    createdAt: "2026-05-21T00:07:00.000Z"
  };
}
