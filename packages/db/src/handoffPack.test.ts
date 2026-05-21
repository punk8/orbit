import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type {
  ActivitySession,
  Event,
  KnowledgeArtifact,
  Memory,
  Recommendation,
  SourceRecord
} from "@orbit/core";
import { defaultPermissionScopeForSource, evidenceFromEvent, hashObject } from "@orbit/core";
import { openOrbitDatabase } from "./connection";
import { ActivityRepository } from "./repositories/activityRepository";
import { AuditRepository } from "./repositories/auditRepository";
import { EventRepository } from "./repositories/eventRepository";
import { KnowledgeRepository } from "./repositories/knowledgeRepository";
import { MemoryRepository } from "./repositories/memoryRepository";
import { RecommendationRepository } from "./repositories/recommendationRepository";
import { SourceRepository } from "./repositories/sourceRepository";
import { buildProjectHandoffPack, buildTodayHandoffPack } from "./handoffPack";

const tempDirs: string[] = [];
const baseTime = "2026-05-21T09:00:00.000Z";

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("handoff pack DB assembly", () => {
  it("builds today and project handoffs from safe confirmed records and writes audit logs", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-db-handoff-test-"));
    tempDirs.push(orbitHome);
    const database = openOrbitDatabase({ orbitHome });
    try {
      const safeEvent = seedSafeOrbitContext(database.db);

      const todayPack = buildTodayHandoffPack(database, {
        date: "2026-05-21",
        generatedAt: "2026-05-21T10:00:00.000Z"
      });
      const projectPack = buildProjectHandoffPack(database, "orbit", {
        generatedAt: "2026-05-21T10:00:00.000Z"
      });

      expect(todayPack.kind).toBe("today");
      expect(todayPack.recentActivity.map((item) => item.id)).toEqual(["act_other", "act_safe"]);
      expect(todayPack.confirmedKnowledge.map((item) => item.id)).toEqual(["kn_other", "kn_safe"]);
      expect(todayPack.activeMemories.map((item) => item.id)).toEqual(["mem_other", "mem_safe"]);
      expect(todayPack.recommendedNextActions.map((item) => item.id)).toEqual(["rec_safe"]);
      expect(todayPack.evidenceIndex.map((item) => item.sourcePointer)).toContain(
        safeEvent.source.pointer
      );
      expect(JSON.stringify(todayPack)).not.toContain("RAW_DB_EVENT_TEXT");

      expect(projectPack.kind).toBe("project");
      expect(projectPack.project).toBe("orbit");
      expect(projectPack.recentActivity.map((item) => item.id)).toEqual(["act_safe"]);
      expect(projectPack.confirmedKnowledge.map((item) => item.id)).toEqual(["kn_safe"]);
      expect(projectPack.activeMemories.map((item) => item.id)).toEqual(["mem_safe"]);

      const handoffAuditLogs = new AuditRepository(database.db)
        .listAuditLogs()
        .filter((log) => log.operation === "handoff.generate");
      expect(handoffAuditLogs).toHaveLength(2);
      expect(handoffAuditLogs[0]?.objectType).toBe("handoff_pack");
    } finally {
      database.close();
    }
  });

  it("excludes unsafe evidence, draft knowledge, needs-review memory, and non-exportable sources", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-db-handoff-privacy-test-"));
    tempDirs.push(orbitHome);
    const database = openOrbitDatabase({ orbitHome });
    try {
      const repos = makeRepositories(database.db);
      repos.sources.upsertSource(makeSource("fixture_codex"));
      repos.sources.upsertSource(makeSource("blocked_codex", { canExportToAgent: false }));

      const ok = makeEvent({ id: "evt_ok", adapterId: "fixture_codex" });
      const secret = makeEvent({
        id: "evt_secret",
        adapterId: "fixture_codex",
        pointer: "codex://safe.jsonl#secret",
        sensitivity: "secret"
      });
      const failed = makeEvent({
        id: "evt_failed",
        adapterId: "fixture_codex",
        pointer: "codex://safe.jsonl#failed",
        redactionState: "failed"
      });
      const blocked = makeEvent({
        id: "evt_blocked",
        adapterId: "blocked_codex",
        pointer: "codex://blocked.jsonl#1"
      });
      for (const event of [ok, secret, failed, blocked]) repos.events.upsertEvent(event);

      repos.activity.upsertActivitySession(makeActivity(secret, { id: "act_secret" }));
      repos.activity.upsertActivitySession(makeActivity(blocked, { id: "act_blocked" }));
      repos.knowledge.upsertKnowledgeArtifact(makeKnowledge(ok, { id: "kn_draft", status: "draft" }));
      repos.memory.upsertMemory(makeMemory(ok, { id: "mem_review", status: "needs_review" }));
      repos.recommendations.upsertRecommendation(makeRecommendation(failed, { id: "rec_failed" }));

      const pack = buildTodayHandoffPack(database, {
        date: "2026-05-21",
        generatedAt: "2026-05-21T10:00:00.000Z"
      });

      expect(pack.recentActivity).toHaveLength(0);
      expect(pack.confirmedKnowledge).toHaveLength(0);
      expect(pack.activeMemories).toHaveLength(0);
      expect(pack.recommendedNextActions).toHaveLength(0);
      expect(pack.excluded.map((item) => item.reason)).toEqual(
        expect.arrayContaining([
          "secret_content",
          "source_export_blocked",
          "draft_knowledge",
          "memory_not_confirmed",
          "failed_redaction"
        ])
      );
    } finally {
      database.close();
    }
  });
});

function seedSafeOrbitContext(db: import("better-sqlite3").Database): Event {
  const repos = makeRepositories(db);
  repos.sources.upsertSource(makeSource("fixture_codex"));
  const event = makeEvent({ id: "evt_safe", adapterId: "fixture_codex" });
  repos.events.upsertEvent(event);
  repos.activity.upsertActivitySession(makeActivity(event));
  repos.knowledge.upsertKnowledgeArtifact(makeKnowledge(event));
  repos.memory.upsertMemory(makeMemory(event));
  repos.recommendations.upsertRecommendation(makeRecommendation(event));

  const otherProject = makeEvent({
    id: "evt_other_project",
    adapterId: "fixture_codex",
    project: "not-orbit",
    pointer: "codex://other.jsonl#1"
  });
  repos.events.upsertEvent(otherProject);
  repos.activity.upsertActivitySession(makeActivity(otherProject, { id: "act_other", project: "not-orbit" }));
  repos.knowledge.upsertKnowledgeArtifact(
    makeKnowledge(otherProject, { id: "kn_other", projects: ["not-orbit"] })
  );
  repos.memory.upsertMemory(makeMemory(otherProject, { id: "mem_other", project: "not-orbit" }));

  return event;
}

function makeRepositories(db: import("better-sqlite3").Database) {
  return {
    activity: new ActivityRepository(db),
    events: new EventRepository(db),
    knowledge: new KnowledgeRepository(db),
    memory: new MemoryRepository(db),
    recommendations: new RecommendationRepository(db),
    sources: new SourceRepository(db)
  };
}

function makeSource(
  id: string,
  overrides: { canExportToAgent?: boolean } = {}
): SourceRecord {
  const permissionScope = defaultPermissionScopeForSource("codex", "internal");
  if (overrides.canExportToAgent !== undefined) {
    permissionScope.canExportToAgent = overrides.canExportToAgent;
  }
  return {
    id,
    kind: "codex",
    displayName: id,
    enabled: true,
    paused: false,
    defaultSensitivity: "internal",
    permissionScope,
    createdAt: baseTime,
    updatedAt: baseTime
  };
}

function makeEvent(
  options: {
    id: string;
    adapterId: string;
    pointer?: string;
    project?: string;
    sensitivity?: Event["privacy"]["sensitivity"];
    redactionState?: Event["privacy"]["redactionState"];
  }
): Event {
  const eventInput = {
    id: options.id,
    adapterId: options.adapterId,
    pointer: options.pointer ?? `codex://safe.jsonl#${options.id}`,
    project: options.project ?? "orbit"
  };
  return {
    id: options.id,
    schemaVersion: 1,
    source: {
      kind: "codex",
      adapterId: options.adapterId,
      externalId: options.id,
      pointer: eventInput.pointer
    },
    occurredAt: baseTime,
    observedAt: baseTime,
    actor: { role: "user", displayName: "Fixture User" },
    context: {
      app: "Codex",
      project: eventInput.project,
      repository: eventInput.project
    },
    type: "message",
    content: {
      title: `Event ${options.id}`,
      text: "RAW_DB_EVENT_TEXT should not appear in handoff"
    },
    privacy: {
      sensitivity: options.sensitivity ?? "internal",
      retentionPolicyId: "default",
      redactionState: options.redactionState ?? "none"
    },
    hash: hashObject(eventInput)
  };
}

function makeActivity(
  event: Event,
  overrides: Partial<ActivitySession> & { project?: string } = {}
): ActivitySession {
  const project = overrides.project ?? event.context.project ?? "orbit";
  return {
    id: overrides.id ?? "act_safe",
    schemaVersion: 1,
    title: overrides.title ?? "Goal 7 implementation",
    startAt: overrides.startAt ?? baseTime,
    endAt: overrides.endAt ?? "2026-05-21T09:15:00.000Z",
    durationSeconds: 900,
    sourceKinds: ["codex"],
    apps: ["Codex"],
    eventCount: 1,
    eventIds: [event.id],
    project,
    summary: "Implemented safe Handoff Pack assembly.",
    evidence: [evidenceFromEvent(event, "Safe event summary")],
    localState: { rawAvailable: false, indexed: true },
    privacy: { sensitivity: "internal", retentionPolicyId: "default" },
    createdAt: baseTime,
    updatedAt: baseTime
  };
}

function makeKnowledge(
  event: Event,
  overrides: Partial<KnowledgeArtifact> & { projects?: string[] } = {}
): KnowledgeArtifact {
  return {
    id: overrides.id ?? "kn_safe",
    schemaVersion: 1,
    type: "decision_record",
    title: "Handoff Pack decision",
    status: overrides.status ?? "confirmed",
    metadata: {
      apps: ["Codex"],
      projects: overrides.projects ?? ["orbit"],
      sourceSessionIds: ["act_safe"],
      language: "en"
    },
    content: {
      description: "Handoff Pack should be reviewable before sharing.",
      keyInsights: ["Confirmed context only."],
      decisions: ["Ship CLI/Desktop handoff before MCP."],
      blockers: ["Package filter tests need root-aware execution."],
      markdown: "Safe confirmed knowledge."
    },
    evidence: [evidenceFromEvent(event, "Safe knowledge summary")],
    confidence: 0.9,
    createdAt: baseTime,
    updatedAt: baseTime
  };
}

function makeMemory(
  event: Event,
  overrides: Partial<Memory> & { project?: string } = {}
): Memory {
  return {
    id: overrides.id ?? "mem_safe",
    schemaVersion: 1,
    kind: "decision",
    title: "Handoff defaults",
    body: "Handoff excludes raw Event text by default.",
    status: overrides.status ?? "confirmed",
    scope: { project: overrides.project ?? "orbit", sourceKinds: ["codex"] },
    tags: ["handoff"],
    evidence: [evidenceFromEvent(event, "Safe memory summary")],
    confidence: 0.9,
    createdAt: baseTime,
    updatedAt: baseTime
  };
}

function makeRecommendation(
  event: Event,
  overrides: Partial<Recommendation> = {}
): Recommendation {
  return {
    id: overrides.id ?? "rec_safe",
    schemaVersion: 1,
    type: overrides.type ?? "risk",
    title: "Keep Handoff Pack privacy-safe",
    explanation: "Raw payloads should stay out of default agent handoffs.",
    suggestedAction: "Review the pack before pasting it into a new agent session.",
    confidence: 0.86,
    impact: "high",
    status: overrides.status ?? "new",
    evidence: [evidenceFromEvent(event, "Safe recommendation summary")],
    createdAt: baseTime
  };
}
