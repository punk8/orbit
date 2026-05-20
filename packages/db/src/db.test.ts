import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type { Event, KnowledgeArtifact, Memory } from "@orbit/core";
import { createStableId, evidenceFromEvent, hashObject } from "@orbit/core";
import { EventRepository } from "./repositories/eventRepository";
import { KnowledgeRepository } from "./repositories/knowledgeRepository";
import { MemoryRepository } from "./repositories/memoryRepository";
import { openOrbitDatabase } from "./connection";

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
