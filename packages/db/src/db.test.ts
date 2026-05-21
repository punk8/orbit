import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type { Event, KnowledgeArtifact, Memory, SourceKind, SourceRecord } from "@orbit/core";
import {
  createStableId,
  defaultPermissionScopeForSource,
  evidenceFromEvent,
  hashObject
} from "@orbit/core";
import { EventRepository } from "./repositories/eventRepository";
import { ActivityRepository } from "./repositories/activityRepository";
import { KnowledgeRepository } from "./repositories/knowledgeRepository";
import { MemoryRepository } from "./repositories/memoryRepository";
import { AuditRepository } from "./repositories/auditRepository";
import {
  editKnowledgeArtifact,
  editMemory,
  reviewKnowledgeArtifact,
  reviewMemory,
  reviewRecommendation
} from "./governance";
import { RecommendationRepository } from "./repositories/recommendationRepository";
import { openOrbitDatabase } from "./connection";
import { resolveOrbitDbPath, writeOrbitRuntimeConfig } from "./orbitHome";
import { SourceRepository } from "./repositories/sourceRepository";
import { cleanupLegacyEventPrivacy } from "./privacyCleanup";
import { runSemanticPipeline } from "./semanticPipeline";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("sqlite store", () => {
  it("migrates, stores events, and searches knowledge/memory", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-db-test-"));
    tempDirs.push(orbitHome);
    const { db, close } = openOrbitDatabase({ orbitHome });
    try {
      const eventRepo = new EventRepository(db);
      const event = makeEvent();
      expect(eventRepo.upsertEvent(event)).toBe(true);
      expect(eventRepo.upsertEvent(event)).toBe(false);
      expect(eventRepo.countEvents()).toBe(1);
      expect(eventRepo.getEvent(event.id)?.source.pointer).toBe("fixture://codex/day-1#1");

      const knowledgeRepo = new KnowledgeRepository(db);
      const artifact = makeKnowledge(event);
      knowledgeRepo.upsertKnowledgeArtifact(artifact);
      expect(knowledgeRepo.countKnowledgeArtifacts()).toBe(1);
      expect(knowledgeRepo.searchKnowledge("fixture").map((item) => item.id)).toEqual([
        artifact.id
      ]);
      knowledgeRepo.deleteKnowledgeArtifact(artifact.id);
      expect(knowledgeRepo.countKnowledgeArtifacts()).toBe(0);

      const memoryRepo = new MemoryRepository(db);
      const memory = makeMemory(event);
      memoryRepo.upsertMemory(memory);
      expect(memoryRepo.countMemories()).toBe(1);
      expect(memoryRepo.searchMemory("fixture").map((item) => item.id)).toEqual([memory.id]);
      memoryRepo.deleteMemory(memory.id);
      expect(memoryRepo.countMemories()).toBe(0);
    } finally {
      close();
    }
  });

  it("lists activity detail events by ids without duplicating repeated ids", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-db-event-detail-test-"));
    tempDirs.push(orbitHome);
    const { db, close } = openOrbitDatabase({ orbitHome });
    try {
      const eventRepo = new EventRepository(db);
      const secondEvent = makeEvent({
        pointer: "fixture://codex/day-1#2",
        text: "Second fixture event"
      });
      const firstEvent = makeEvent({
        pointer: "fixture://codex/day-1#1",
        text: "First fixture event"
      });
      eventRepo.upsertEvent(secondEvent);
      eventRepo.upsertEvent(firstEvent);

      const events = eventRepo.listEventsByIds([secondEvent.id, firstEvent.id, secondEvent.id]);

      expect(events.map((event) => event.id)).toEqual([firstEvent.id, secondEvent.id].sort());
      expect(events).toHaveLength(2);
    } finally {
      close();
    }
  });

  it("reviews knowledge, memories, and recommendations with audit logs", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-db-review-test-"));
    tempDirs.push(orbitHome);
    const { db, close } = openOrbitDatabase({ orbitHome });
    try {
      const event = makeEvent();
      new EventRepository(db).upsertEvent(event);
      new KnowledgeRepository(db).upsertKnowledgeArtifact({
        ...makeKnowledge(event),
        content: {
          ...makeKnowledge(event).content,
          keyInsights: ["Orbit should keep reviewable knowledge.", "Memory needs confirmation."]
        }
      });

      const knowledgeResult = reviewKnowledgeArtifact(db, "knowledge_fixture", "confirm");
      expect(knowledgeResult.artifact.status).toBe("confirmed");
      expect(knowledgeResult.generatedMemories).toHaveLength(2);

      const memory = knowledgeResult.generatedMemories[0]!;
      expect(reviewMemory(db, memory.id, "confirm").status).toBe("confirmed");

      const recommendationRepo = new RecommendationRepository(db);
      recommendationRepo.upsertRecommendation(makeRecommendation(event));
      expect(reviewRecommendation(db, "recommendation_fixture", "dismiss").status).toBe(
        "dismissed"
      );

      const operations = new AuditRepository(db).listAuditLogs().map((log) => log.operation);
      expect(operations).toContain("knowledge.confirm");
      expect(operations).toContain("memory.generate_candidate");
      expect(operations).toContain("memory.confirm");
      expect(operations).toContain("recommendation.dismiss");
    } finally {
      close();
    }
  });

  it("edits knowledge content without dropping evidence or FTS indexing", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-db-knowledge-edit-test-"));
    tempDirs.push(orbitHome);
    const { db, close } = openOrbitDatabase({ orbitHome });
    try {
      const event = makeEvent();
      new EventRepository(db).upsertEvent(event);
      const repository = new KnowledgeRepository(db);
      repository.upsertKnowledgeArtifact(makeKnowledge(event));

      const updated = editKnowledgeArtifact(db, "knowledge_fixture", {
        title: "Edited fixture knowledge",
        description: "Edited description.",
        keyInsights: ["Edited insight"],
        markdown: "# Edited fixture knowledge\n\nEdited description."
      });

      expect(updated.evidence).toEqual([evidenceFromEvent(event, "Synthetic fixture event")]);
      expect(repository.searchKnowledge("Edited").map((artifact) => artifact.id)).toContain(
        "knowledge_fixture"
      );
      const operations = new AuditRepository(db).listAuditLogs().map((log) => log.operation);
      expect(operations).toContain("knowledge.edit");
    } finally {
      close();
    }
  });

  it("edits memory content without dropping evidence or FTS indexing", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-db-memory-edit-test-"));
    tempDirs.push(orbitHome);
    const { db, close } = openOrbitDatabase({ orbitHome });
    try {
      const event = makeEvent();
      new EventRepository(db).upsertEvent(event);
      const repository = new MemoryRepository(db);
      repository.upsertMemory(makeMemory(event));

      const updated = editMemory(db, "memory_fixture", {
        title: "Edited fixture memory",
        body: "Edited memory body.",
        tags: ["edited", "fixture"]
      });

      expect(updated.evidence).toEqual([evidenceFromEvent(event, "Synthetic fixture event")]);
      expect(repository.searchMemory("Edited").map((memory) => memory.id)).toContain(
        "memory_fixture"
      );
      const operations = new AuditRepository(db).listAuditLogs().map((log) => log.operation);
      expect(operations).toContain("memory.edit");
    } finally {
      close();
    }
  });

  it("resolves configured database path from runtime config", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-db-config-test-"));
    tempDirs.push(orbitHome);
    const configuredPath = join(orbitHome, "custom", "orbit-alpha.db");

    writeOrbitRuntimeConfig(orbitHome, { configuredDatabasePath: configuredPath });

    expect(resolveOrbitDbPath(orbitHome)).toBe(configuredPath);
  });

  it("stores source runtime state", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-db-source-runtime-test-"));
    tempDirs.push(orbitHome);
    const { db, close } = openOrbitDatabase({ orbitHome });
    try {
      const sources = new SourceRepository(db);
      sources.upsertSource({
        id: "fixture_codex",
        kind: "codex",
        displayName: "Fixture Codex",
        enabled: true,
        paused: false,
        defaultSensitivity: "internal",
        permissionScope: defaultPermissionScopeForSource("codex", "internal"),
        createdAt: "2026-05-20T09:00:00.000Z",
        updatedAt: "2026-05-20T09:00:00.000Z"
      });

      sources.setPaused("fixture_codex", true);
      sources.recordSyncSuccess("fixture_codex", {
        lastEventAt: "2026-05-20T09:15:00.000Z"
      });
      sources.setEnabled("fixture_codex", false);

      const source = sources.getSource("fixture_codex");
      expect(source?.enabled).toBe(false);
      expect(source?.paused).toBe(true);
      expect(source?.lastSyncAt).toBeTruthy();
      expect(source?.lastEventAt).toBe("2026-05-20T09:15:00.000Z");
      expect(source?.permissionScope.canUseForAI).toBe(true);

      sources.recordSyncError("fixture_codex", "adapter unavailable");
      expect(sources.getSource("fixture_codex")?.lastError).toBe("adapter unavailable");
    } finally {
      close();
    }
  });

  it("resets source cursor without deleting the source", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-db-source-reset-test-"));
    tempDirs.push(orbitHome);
    const { db, close } = openOrbitDatabase({ orbitHome });
    try {
      const sources = new SourceRepository(db);
      sources.upsertSource(makeSource("fixture_codex"));
      sources.setCursor("fixture_codex", "12");

      sources.resetCursor("fixture_codex");

      expect(sources.getSource("fixture_codex")).toBeTruthy();
      expect(sources.getCursor("fixture_codex")).toBeUndefined();
    } finally {
      close();
    }
  });

  it("deletes source runtime rows without deleting unrelated sources", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-db-source-delete-test-"));
    tempDirs.push(orbitHome);
    const { db, close } = openOrbitDatabase({ orbitHome });
    try {
      const sources = new SourceRepository(db);
      sources.upsertSource(makeSource("fixture_codex"));
      sources.upsertSource(makeSource("fixture_seatalk", "seatalk"));
      sources.setCursor("fixture_codex", "12");
      sources.setCursor("fixture_seatalk", "7");

      const result = sources.deleteSource("fixture_codex");

      expect(result.deletedSources).toBe(1);
      expect(result.deletedCursors).toBe(1);
      expect(sources.getSource("fixture_codex")).toBeUndefined();
      expect(sources.getCursor("fixture_codex")).toBeUndefined();
      expect(sources.getSource("fixture_seatalk")).toBeTruthy();
      expect(sources.getCursor("fixture_seatalk")).toBe("7");
    } finally {
      close();
    }
  });

  it("cleans legacy raw event text when source policy disallows raw storage", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-db-privacy-cleanup-test-"));
    tempDirs.push(orbitHome);
    const { db, close } = openOrbitDatabase({ orbitHome });
    try {
      const sources = new SourceRepository(db);
      sources.upsertSource(makeSource("fixture_codex"));
      const eventRepo = new EventRepository(db);
      const event = makeEvent({
        pointer: "fixture://codex/day-1#legacy",
        text: "legacy raw content that should not remain stored as raw text"
      });
      eventRepo.upsertEvent(event);

      const cleanup = cleanupLegacyEventPrivacy({
        db,
        orbitHome,
        dbPath: join(orbitHome, "orbit.db"),
        close
      });
      const cleanedEvent = eventRepo.getEvent(event.id);
      const auditOperations = new AuditRepository(db).listAuditLogs().map((log) => log.operation);

      expect(cleanup.cleanedEvents).toBe(1);
      expect(cleanedEvent?.content.text).toBeUndefined();
      expect(cleanedEvent?.content.summary).toContain("legacy raw content");
      expect(cleanedEvent?.source.pointer).toBe("fixture://codex/day-1#legacy");
      expect(cleanedEvent?.privacy.redactionState).toBe("redacted");
      expect(auditOperations).toContain("privacy.cleanup_legacy_events");
    } finally {
      close();
    }
  });

  it("cleans event raw text without deleting derived context evidence", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-db-privacy-derived-test-"));
    tempDirs.push(orbitHome);
    const { db, close } = openOrbitDatabase({ orbitHome });
    try {
      const source = makeSource("fixture_codex");
      new SourceRepository(db).upsertSource(source);
      const event = makeEvent({
        pointer: "fixture://codex/day-1#derived",
        text: "legacy raw context with durable derived evidence"
      });
      new EventRepository(db).upsertEvent(event);
      const knowledge = makeKnowledge(event);
      new KnowledgeRepository(db).upsertKnowledgeArtifact(knowledge);
      new MemoryRepository(db).upsertMemory(makeMemory(event));
      new RecommendationRepository(db).upsertRecommendation(makeRecommendation(event));

      cleanupLegacyEventPrivacy({ db, orbitHome, dbPath: join(orbitHome, "orbit.db"), close });

      expect(
        new KnowledgeRepository(db).getKnowledgeArtifact(knowledge.id)?.evidence[0]?.eventId
      ).toBe(event.id);
      expect(new MemoryRepository(db).getMemory("memory_fixture")?.evidence[0]?.eventId).toBe(
        event.id
      );
      expect(
        new RecommendationRepository(db).getRecommendation("recommendation_fixture")?.evidence[0]
          ?.eventId
      ).toBe(event.id);
    } finally {
      close();
    }
  });

  it("does not summarize secret or failed-redaction legacy raw text", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-db-privacy-secret-test-"));
    tempDirs.push(orbitHome);
    const { db, close } = openOrbitDatabase({ orbitHome });
    try {
      new SourceRepository(db).upsertSource(makeSource("fixture_codex"));
      const eventRepo = new EventRepository(db);
      const secretEvent = makeEvent({
        pointer: "fixture://codex/day-1#secret",
        text: "password=do-not-keep",
        sensitivity: "secret"
      });
      const failedEvent = makeEvent({
        pointer: "fixture://codex/day-1#failed",
        text: "raw text from failed redaction",
        redactionState: "failed"
      });
      eventRepo.upsertEvent(secretEvent);
      eventRepo.upsertEvent(failedEvent);

      cleanupLegacyEventPrivacy({ db, orbitHome, dbPath: join(orbitHome, "orbit.db"), close });

      const cleanedSecret = eventRepo.getEvent(secretEvent.id);
      const cleanedFailed = eventRepo.getEvent(failedEvent.id);
      expect(cleanedSecret?.content.text).toBeUndefined();
      expect(cleanedSecret?.content.summary).not.toContain("do-not-keep");
      expect(cleanedSecret?.content.summary).toBe("[REDACTED SECRET]");
      expect(cleanedSecret?.privacy.redactionState).toBe("redacted");
      expect(cleanedFailed?.content.text).toBeUndefined();
      expect(cleanedFailed?.content.summary).not.toContain("failed redaction");
      expect(cleanedFailed?.privacy.redactionState).toBe("failed");
    } finally {
      close();
    }
  });

  it("refreshes activity summaries after cleaning legacy raw text", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-db-privacy-activity-test-"));
    tempDirs.push(orbitHome);
    const { db, close } = openOrbitDatabase({ orbitHome });
    try {
      new SourceRepository(db).upsertSource(makeSource("fixture_codex"));
      const eventRepo = new EventRepository(db);
      const event = makeEvent({
        pointer: "fixture://codex/day-1#activity",
        text: "legacy raw activity details",
        title: ""
      });
      eventRepo.upsertEvent(event);
      runSemanticPipeline({ db, orbitHome, dbPath: join(orbitHome, "orbit.db"), close });
      expect(new ActivityRepository(db).listActivitySessions()[0]?.summary).toContain(
        "legacy raw activity details"
      );
      db.prepare("UPDATE activity_sessions SET summary = ?").run("stale raw activity summary");

      cleanupLegacyEventPrivacy({ db, orbitHome, dbPath: join(orbitHome, "orbit.db"), close });

      expect(new ActivityRepository(db).listActivitySessions()[0]?.summary).not.toContain(
        "stale raw activity summary"
      );
      expect(new ActivityRepository(db).listActivitySessions()[0]?.summary).toContain(
        "legacy raw activity details"
      );
    } finally {
      close();
    }
  });
});

function makeSource(id: string, kind: SourceKind = "codex"): SourceRecord {
  const sensitivity = kind === "seatalk" ? "confidential" : "internal";
  const now = "2026-05-20T09:00:00.000Z";
  return {
    id,
    kind,
    displayName: id,
    enabled: true,
    paused: false,
    defaultSensitivity: sensitivity,
    permissionScope: defaultPermissionScopeForSource(kind, sensitivity),
    createdAt: now,
    updatedAt: now
  };
}

function makeEvent(
  options: {
    pointer?: string;
    title?: string;
    text?: string;
    sensitivity?: Event["privacy"]["sensitivity"];
    redactionState?: Event["privacy"]["redactionState"];
  } = {}
): Event {
  const source = {
    kind: "codex" as const,
    adapterId: "fixture_codex",
    externalId: "codex-1",
    pointer: options.pointer ?? "fixture://codex/day-1#1"
  };
  const eventInput = {
    source,
    occurredAt: "2026-05-20T09:00:00.000Z",
    type: "message",
    text: options.text ?? "Synthetic fixture event"
  };
  const event: Event = {
    id: createStableId("event", eventInput),
    schemaVersion: 1,
    source,
    occurredAt: eventInput.occurredAt,
    observedAt: eventInput.occurredAt,
    actor: { role: "user", displayName: "Fixture User" },
    context: { app: "Codex", project: "orbit", repository: "orbit" },
    type: "message",
    content: { title: "Fixture event", text: eventInput.text },
    privacy: {
      sensitivity: options.sensitivity ?? "internal",
      retentionPolicyId: "default",
      redactionState: options.redactionState ?? "none"
    },
    hash: hashObject(eventInput)
  };
  if (options.title !== undefined) {
    if (options.title) {
      event.content.title = options.title;
    } else {
      delete event.content.title;
    }
  }
  return event;
}

function makeKnowledge(event: Event): KnowledgeArtifact {
  return {
    id: "knowledge_fixture",
    schemaVersion: 1,
    type: "daily_brief",
    title: "Fixture knowledge",
    status: "draft",
    metadata: {
      apps: ["Codex"],
      projects: ["orbit"],
      sourceSessionIds: []
    },
    content: {
      description: "Synthetic fixture knowledge.",
      keyInsights: ["Fixture insight"],
      markdown: "# Fixture knowledge\n\nSynthetic fixture knowledge."
    },
    evidence: [evidenceFromEvent(event, "Synthetic fixture event")],
    confidence: 0.8,
    createdAt: "2026-05-20T09:05:00.000Z",
    updatedAt: "2026-05-20T09:05:00.000Z"
  };
}

function makeMemory(event: Event): Memory {
  return {
    id: "memory_fixture",
    schemaVersion: 1,
    kind: "project_fact",
    title: "Fixture memory",
    body: "Synthetic fixture memory.",
    status: "confirmed",
    scope: { project: "orbit", sourceKinds: ["codex"] },
    tags: ["fixture"],
    evidence: [evidenceFromEvent(event, "Synthetic fixture event")],
    confidence: 0.8,
    createdAt: "2026-05-20T09:06:00.000Z",
    updatedAt: "2026-05-20T09:06:00.000Z"
  };
}

function makeRecommendation(event: Event) {
  return {
    id: "recommendation_fixture",
    schemaVersion: 1,
    type: "follow_up" as const,
    title: "Review fixture recommendation",
    explanation: "Synthetic fixture recommendation.",
    suggestedAction: "Confirm this does not execute external side effects.",
    confidence: 0.8,
    impact: "medium" as const,
    status: "new" as const,
    evidence: [evidenceFromEvent(event, "Synthetic fixture event")],
    createdAt: "2026-05-20T09:07:00.000Z"
  };
}
