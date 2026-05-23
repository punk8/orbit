import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import type { AIProvider } from "@orbit/ai";
import type { Event } from "@orbit/core";
import {
  createStableId,
  defaultPermissionScopeForSource,
  hashObject,
  makeObservationPermissionScope
} from "@orbit/core";
import { openOrbitDatabase } from "./connection";
import { ActivityRepository } from "./repositories/activityRepository";
import { EventRepository } from "./repositories/eventRepository";
import { AuditRepository } from "./repositories/auditRepository";
import { KnowledgeRepository } from "./repositories/knowledgeRepository";
import { SourceRepository } from "./repositories/sourceRepository";
import { runSemanticPipeline, runSemanticPipelineWithProvider } from "./semanticPipeline";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("semantic pipeline AI provider integration", () => {
  it("updates live observation Activity in place as more events arrive", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-live-observation-test-"));
    tempDirs.push(orbitHome);
    const database = openOrbitDatabase({ orbitHome });
    try {
      upsertDesktopObservationSource(database.db);
      const eventRepository = new EventRepository(database.db);
      const start = new Date(Date.now() - 40 * 60 * 1000);
      const second = new Date(start.getTime() + 5 * 60 * 1000);
      eventRepository.upsertEvent(makeDesktopObservationEvent("1", start.toISOString()));

      runSemanticPipeline(database);
      const activityRepository = new ActivityRepository(database.db);
      const firstSession = activityRepository.listActivitySessions()[0]!;

      eventRepository.upsertEvent(makeDesktopObservationEvent("2", second.toISOString()));
      runSemanticPipeline(database);
      const sessions = activityRepository.listActivitySessions();

      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.id).toBe(firstSession.id);
      expect(sessions[0]?.eventCount).toBe(2);
      expect(sessions[0]?.durationSeconds).toBe(300);
      expect(new KnowledgeRepository(database.db).listKnowledgeArtifacts()).toHaveLength(0);
    } finally {
      database.close();
    }
  });

  it("waits for observation sessions to close before drafting Knowledge", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-observation-close-test-"));
    tempDirs.push(orbitHome);
    const database = openOrbitDatabase({ orbitHome });
    try {
      upsertDesktopObservationSource(database.db);
      const eventRepository = new EventRepository(database.db);
      eventRepository.upsertEvent(makeDesktopObservationEvent("active", new Date().toISOString()));

      runSemanticPipeline(database);
      let sessions = new ActivityRepository(database.db).listActivitySessions();
      expect(sessions[0]?.localState.closed).toBe(false);
      expect(new KnowledgeRepository(database.db).listKnowledgeArtifacts()).toHaveLength(0);

      const closedStart = new Date(Date.now() - 40 * 60 * 1000);
      const closedEnd = new Date(closedStart.getTime() + 11 * 60 * 1000);
      eventRepository.upsertEvent(
        makeDesktopObservationEvent("closed_1", closedStart.toISOString(), "Closed work")
      );
      eventRepository.upsertEvent(
        makeDesktopObservationEvent("closed_2", closedEnd.toISOString(), "Closed work follow-up")
      );

      runSemanticPipeline(database);
      sessions = new ActivityRepository(database.db).listActivitySessions();
      expect(sessions.some((session) => session.localState.closed === true)).toBe(true);
      expect(new KnowledgeRepository(database.db).listKnowledgeArtifacts()).toHaveLength(1);
    } finally {
      database.close();
    }
  });

  it("keeps low-quality closed perception sessions Activity-only", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-low-quality-session-test-"));
    tempDirs.push(orbitHome);
    const database = openOrbitDatabase({ orbitHome });
    try {
      upsertFixtureSource(database.db, {
        id: "perception_screen",
        kind: "screen",
        displayName: "Screen Observation",
        defaultSensitivity: "confidential"
      });
      new EventRepository(database.db).upsertEvent(
        makePerceptionScreenEvent("low_quality", new Date(Date.now() - 40 * 60 * 1000).toISOString())
      );

      runSemanticPipeline(database);

      const session = new ActivityRepository(database.db).listActivitySessions()[0]!;
      expect(session.localState.closed).toBe(true);
      expect(session.localState.qualitySignals?.isLowQuality).toBe(true);
      expect(new KnowledgeRepository(database.db).listKnowledgeArtifacts()).toHaveLength(0);
    } finally {
      database.close();
    }
  });

  it("uses the requested language for deterministic Knowledge drafts", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-language-pipeline-test-"));
    tempDirs.push(orbitHome);
    const database = openOrbitDatabase({ orbitHome });
    try {
      upsertFixtureSource(database.db);
      new EventRepository(database.db).upsertEvent(makeEvent("1", "todo"));

      runSemanticPipeline(database, { language: "zh-CN" });

      const artifact = new KnowledgeRepository(database.db).listKnowledgeArtifacts()[0]!;
      expect(artifact.metadata.language).toBe("zh-CN");
      expect(artifact.title).toContain("知识");
      expect(artifact.content.markdown).toContain("## 关键洞察");
    } finally {
      database.close();
    }
  });

  it("refreshes unreviewed deterministic drafts when the requested Knowledge language changes", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-language-refresh-test-"));
    tempDirs.push(orbitHome);
    const database = openOrbitDatabase({ orbitHome });
    try {
      upsertFixtureSource(database.db);
      new EventRepository(database.db).upsertEvent(makeEvent("1", "message"));

      runSemanticPipeline(database, { language: "en" });
      const knowledgeRepository = new KnowledgeRepository(database.db);
      const english = knowledgeRepository.listKnowledgeArtifacts()[0]!;
      expect(english.status).toBe("draft");
      expect(english.metadata.language).toBe("en");
      expect(english.content.markdown).toContain("## Key Insights");

      runSemanticPipeline(database, { language: "zh-CN" });

      const refreshed = knowledgeRepository.getKnowledgeArtifact(english.id)!;
      expect(refreshed.id).toBe(english.id);
      expect(refreshed.status).toBe("draft");
      expect(refreshed.createdAt).toBe(english.createdAt);
      expect(refreshed.metadata.language).toBe("zh-CN");
      expect(refreshed.title).toContain("知识");
      expect(refreshed.content.markdown).toContain("## 关键洞察");
    } finally {
      database.close();
    }
  });

  it("does not refresh reviewed Knowledge when the requested language changes", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-language-reviewed-test-"));
    tempDirs.push(orbitHome);
    const database = openOrbitDatabase({ orbitHome });
    try {
      upsertFixtureSource(database.db);
      new EventRepository(database.db).upsertEvent(makeEvent("1", "message"));

      runSemanticPipeline(database, { language: "en" });
      const knowledgeRepository = new KnowledgeRepository(database.db);
      const artifact = knowledgeRepository.listKnowledgeArtifacts()[0]!;
      knowledgeRepository.upsertKnowledgeArtifact({
        ...artifact,
        status: "confirmed",
        title: "Reviewed English title"
      });

      runSemanticPipeline(database, { language: "zh-CN" });

      const preserved = knowledgeRepository.getKnowledgeArtifact(artifact.id)!;
      expect(preserved.status).toBe("confirmed");
      expect(preserved.title).toBe("Reviewed English title");
      expect(preserved.metadata.language).toBe("en");
      expect(preserved.content.markdown).toContain("## Key Insights");
    } finally {
      database.close();
    }
  });

  it("uses provider drafts and filters unknown evidence IDs", async () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-provider-pipeline-test-"));
    tempDirs.push(orbitHome);
    const database = openOrbitDatabase({ orbitHome });
    try {
      const events = [makeEvent("1", "message"), makeEvent("2", "todo")];
      upsertFixtureSource(database.db);
      const eventRepository = new EventRepository(database.db);
      for (const event of events) {
        eventRepository.upsertEvent(event);
      }

      await runSemanticPipelineWithProvider(database, {
        aiProvider: makeProvider({
          keyInsights: [
            { text: "Provider insight", evidenceIds: [events[0]!.id] },
            { text: "Invented insight", evidenceIds: ["missing_event"] }
          ],
          followUps: [
            { title: "Provider follow-up", evidenceIds: [events[1]!.id] },
            { title: "Invented follow-up", evidenceIds: ["missing_event"] }
          ]
        })
      });

      const artifact = new KnowledgeRepository(database.db).listKnowledgeArtifacts()[0]!;
      expect(artifact.metadata.generatedBy).toBe("provider_test");
      expect(artifact.content.keyInsights).toEqual(["Provider insight"]);
      expect(artifact.content.followUps?.map((item) => item.title)).toEqual([
        "Provider follow-up"
      ]);
      expect(artifact.evidence.map((ref) => ref.eventId).sort()).toEqual(
        events.map((event) => event.id).sort()
      );
    } finally {
      database.close();
    }
  });

  it("falls back to deterministic knowledge when the provider fails", async () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-provider-fallback-test-"));
    tempDirs.push(orbitHome);
    const database = openOrbitDatabase({ orbitHome });
    try {
      upsertFixtureSource(database.db);
      new EventRepository(database.db).upsertEvent(makeEvent("1", "message"));

      await runSemanticPipelineWithProvider(database, {
        aiProvider: {
          id: "provider_failure",
          kind: "openai-compatible",
          enabled: true,
          name: "provider_failure",
          async draftKnowledge() {
            throw new Error("provider unavailable");
          }
        }
      });

      const artifact = new KnowledgeRepository(database.db).listKnowledgeArtifacts()[0]!;
      expect(artifact.metadata.generatedBy).toBe("deterministic_fallback");
      expect(artifact.title).toContain("Knowledge:");
    } finally {
      database.close();
    }
  });

  it("does not overwrite reviewed Knowledge when re-running with a provider", async () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-provider-review-test-"));
    tempDirs.push(orbitHome);
    const database = openOrbitDatabase({ orbitHome });
    try {
      upsertFixtureSource(database.db);
      new EventRepository(database.db).upsertEvent(makeEvent("1", "message"));
      await runSemanticPipelineWithProvider(database, {
        aiProvider: makeProvider({
          title: "First provider title"
        })
      });

      const knowledgeRepository = new KnowledgeRepository(database.db);
      const artifact = knowledgeRepository.listKnowledgeArtifacts()[0]!;
      knowledgeRepository.upsertKnowledgeArtifact({
        ...artifact,
        title: "Reviewed title",
        status: "confirmed"
      });

      await runSemanticPipelineWithProvider(database, {
        aiProvider: makeProvider({
          title: "Second provider title"
        })
      });

      expect(knowledgeRepository.getKnowledgeArtifact(artifact.id)?.title).toBe("Reviewed title");
      expect(knowledgeRepository.getKnowledgeArtifact(artifact.id)?.status).toBe("confirmed");
    } finally {
      database.close();
    }
  });

  it("does not overwrite Knowledge whose source evidence has been deleted", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-evidence-unavailable-test-"));
    tempDirs.push(orbitHome);
    const database = openOrbitDatabase({ orbitHome });
    try {
      upsertFixtureSource(database.db);
      const event = makeEvent("1", "message");
      new EventRepository(database.db).upsertEvent(event);
      runSemanticPipeline(database);
      const knowledgeRepository = new KnowledgeRepository(database.db);
      const artifact = knowledgeRepository.listKnowledgeArtifacts()[0]!;
      knowledgeRepository.upsertKnowledgeArtifact({
        ...artifact,
        status: "confirmed",
        metadata: {
          ...artifact.metadata,
          evidenceState: "unavailable",
          evidenceUnavailableReason: "source_events_deleted"
        },
        evidence: artifact.evidence.map((ref) => {
          const next = {
            ...ref,
            availability: "unavailable" as const,
            unavailableReason: "source_events_deleted" as const
          };
          delete next.eventId;
          return next;
        })
      });
      new EventRepository(database.db).deleteEventsByIds([event.id]);

      runSemanticPipeline(database);

      const updated = knowledgeRepository.getKnowledgeArtifact(artifact.id);
      expect(updated?.status).toBe("confirmed");
      expect(updated?.metadata.evidenceState).toBe("unavailable");
      expect(updated?.evidence[0]?.eventId).toBeUndefined();
    } finally {
      database.close();
    }
  });

  it("filters provider input by source permission and writes AI audit logs", async () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-provider-policy-test-"));
    tempDirs.push(orbitHome);
    const database = openOrbitDatabase({ orbitHome });
    try {
      upsertFixtureSource(database.db);
      new SourceRepository(database.db).upsertSource({
        id: "fixture_seatalk",
        kind: "seatalk",
        displayName: "Fixture SeaTalk",
        enabled: true,
        paused: false,
        defaultSensitivity: "confidential",
        permissionScope: defaultPermissionScopeForSource("seatalk", "confidential"),
        createdAt: "2026-05-20T09:00:00.000Z",
        updatedAt: "2026-05-20T09:00:00.000Z"
      });
      const codexEvent = makeEvent("1", "message");
      const confidentialEvent: Event = {
        ...makeEvent("2", "message"),
        source: {
          kind: "seatalk",
          adapterId: "fixture_seatalk",
          externalId: "2",
          pointer: "fixture://seatalk/provider#2"
        },
        privacy: {
          sensitivity: "confidential",
          retentionPolicyId: "default",
          redactionState: "none"
        },
        content: { title: "Confidential SeaTalk message", text: "private escalation" }
      };
      const eventRepository = new EventRepository(database.db);
      eventRepository.upsertEvent(codexEvent);
      eventRepository.upsertEvent(confidentialEvent);

      const providerEventIds: string[][] = [];
      await runSemanticPipelineWithProvider(database, {
        aiProvider: {
          id: "policy_provider",
          kind: "mock",
          enabled: true,
          name: "policy_provider",
          async draftKnowledge({ events }) {
            providerEventIds.push(events.map((event) => event.id));
            return {
              title: "Policy draft",
              description: "Provider saw only allowed evidence.",
              keyInsights: [{ text: "Allowed insight", evidenceIds: [events[0]!.id] }],
              decisions: [],
              blockers: [],
              followUps: [],
              confidence: 0.9
            };
          }
        }
      });

      expect(providerEventIds.flat()).toContain(codexEvent.id);
      expect(providerEventIds.flat()).not.toContain(confidentialEvent.id);
      const aiLogs = new AuditRepository(database.db)
        .listAuditLogs()
        .filter((log) => log.operation === "ai.draft_knowledge");
      expect(aiLogs.length).toBeGreaterThan(0);
      expect(JSON.stringify(aiLogs[0]?.details)).toContain("filteredEventCount");
    } finally {
      database.close();
    }
  });
});

function upsertFixtureSource(
  db: Database.Database,
  overrides: {
    id?: string;
    kind?: Event["source"]["kind"];
    displayName?: string;
    defaultSensitivity?: Event["privacy"]["sensitivity"];
  } = {}
): void {
  const kind = overrides.kind ?? "codex";
  const defaultSensitivity = overrides.defaultSensitivity ?? "internal";
  new SourceRepository(db).upsertSource({
    id: overrides.id ?? "fixture_codex",
    kind,
    displayName: overrides.displayName ?? "Fixture Codex",
    enabled: true,
    paused: false,
    defaultSensitivity,
    permissionScope: defaultPermissionScopeForSource(kind, defaultSensitivity),
    createdAt: "2026-05-20T09:00:00.000Z",
    updatedAt: "2026-05-20T09:00:00.000Z"
  });
}

function upsertDesktopObservationSource(db: Database.Database): void {
  new SourceRepository(db).upsertSource({
    id: "desktop_observation",
    kind: "desktop",
    displayName: "Desktop Observation",
    enabled: true,
    paused: false,
    defaultSensitivity: "internal",
    permissionScope: makeObservationPermissionScope("desktop"),
    createdAt: "2026-05-21T09:00:00.000Z",
    updatedAt: "2026-05-21T09:00:00.000Z"
  });
}

function makeProvider(
  output: Partial<Awaited<ReturnType<AIProvider["draftKnowledge"]>>>
): AIProvider {
  return {
    id: "provider_test",
    kind: "mock",
    enabled: true,
    name: "provider_test",
    async draftKnowledge({ events }) {
      return {
        title: output.title ?? "Provider knowledge",
        description: output.description ?? "Provider generated description.",
        keyInsights: output.keyInsights ?? [
          { text: "Provider insight", evidenceIds: [events[0]!.id] }
        ],
        decisions: output.decisions ?? [],
        blockers: output.blockers ?? [],
        followUps: output.followUps ?? [],
        confidence: output.confidence ?? 0.9
      };
    }
  };
}

function makeEvent(id: string, type: Event["type"]): Event {
  const source = {
    kind: "codex" as const,
    adapterId: "fixture_codex",
    externalId: id,
    pointer: `fixture://codex/provider#${id}`
  };
  const input = {
    source,
    occurredAt: `2026-05-20T09:0${id}:00.000Z`,
    type,
    title: type === "todo" ? "Follow up provider" : "Build provider"
  };
  return {
    id: createStableId("event", input),
    schemaVersion: 1,
    source,
    occurredAt: input.occurredAt,
    observedAt: input.occurredAt,
    context: {
      app: "Codex",
      project: "orbit"
    },
    type,
    content: {
      title: input.title
    },
    privacy: {
      sensitivity: "internal",
      retentionPolicyId: "default",
      redactionState: "none"
    },
    hash: hashObject(input)
  };
}

function makeDesktopObservationEvent(
  id: string,
  occurredAt: string,
  windowTitle = "Orbit background observation"
): Event {
  const source = {
    kind: "desktop" as const,
    adapterId: "desktop_observation",
    externalId: id,
    pointer: `desktop://window/test#${id}`
  };
  const input = {
    source,
    occurredAt,
    type: "window_focus" as const,
    windowTitle
  };
  return {
    id: createStableId("event", input),
    schemaVersion: 1,
    source,
    occurredAt,
    observedAt: occurredAt,
    context: {
      app: "Cursor",
      windowTitle
    },
    type: "window_focus",
    content: {
      title: "Focused window in Cursor",
      summary: `Window focus observed in Cursor: ${windowTitle}`
    },
    classification: {
      topics: ["background_observation"],
      entities: ["Cursor"],
      intent: "observation",
      confidence: 0.8
    },
    privacy: {
      sensitivity: "confidential",
      retentionPolicyId: "observation_default",
      redactionState: "none"
    },
    hash: hashObject(input)
  };
}

function makePerceptionScreenEvent(id: string, occurredAt: string): Event {
  const source = {
    kind: "screen" as const,
    adapterId: "perception_screen",
    externalId: id,
    pointer: `screen://capture/test/${id}`
  };
  return {
    id: createStableId("event", { source, occurredAt }),
    schemaVersion: 1,
    source,
    occurredAt,
    observedAt: occurredAt,
    context: {
      app: "Cursor",
      threadId: "low-quality"
    },
    type: "screen_observation",
    content: {
      title: "Screen frame",
      summary: "Single low-signal frame.",
      metadata: {
        frameHash: id,
        rawFrameStored: false
      }
    },
    privacy: {
      sensitivity: "confidential",
      retentionPolicyId: "perception_summary_only",
      redactionState: "none"
    },
    hash: hashObject({ source, occurredAt })
  };
}
