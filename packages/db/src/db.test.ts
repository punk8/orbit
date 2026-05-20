import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type { Event, KnowledgeArtifact, Memory } from "@orbit/core";
import {
  createStableId,
  defaultPermissionScopeForSource,
  evidenceFromEvent,
  hashObject
} from "@orbit/core";
import { EventRepository } from "./repositories/eventRepository";
import { KnowledgeRepository } from "./repositories/knowledgeRepository";
import { MemoryRepository } from "./repositories/memoryRepository";
import { AuditRepository } from "./repositories/auditRepository";
import { reviewKnowledgeArtifact, reviewMemory, reviewRecommendation } from "./governance";
import { RecommendationRepository } from "./repositories/recommendationRepository";
import { openOrbitDatabase } from "./connection";
import { resolveOrbitDbPath, writeOrbitRuntimeConfig } from "./orbitHome";
import { SourceRepository } from "./repositories/sourceRepository";

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
});

function makeEvent(): Event {
  const source = {
    kind: "codex" as const,
    adapterId: "fixture_codex",
    externalId: "codex-1",
    pointer: "fixture://codex/day-1#1"
  };
  const eventInput = {
    source,
    occurredAt: "2026-05-20T09:00:00.000Z",
    type: "message",
    text: "Synthetic fixture event"
  };
  return {
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
      sensitivity: "internal",
      retentionPolicyId: "default",
      redactionState: "none"
    },
    hash: hashObject(eventInput)
  };
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
