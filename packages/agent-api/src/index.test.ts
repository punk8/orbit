import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ActivitySession, Event, KnowledgeArtifact, Memory, Recommendation } from "@orbit/core";
import { defaultPermissionScopeForSource, evidenceFromEvent, hashObject } from "@orbit/core";
import {
  ActivityRepository,
  EventRepository,
  KnowledgeRepository,
  MemoryRepository,
  RecommendationRepository,
  SourceRepository,
  openOrbitDatabase
} from "@orbit/db";
import { agentApiStatus, buildAgentHandoffResource, readAgentHandoffResource } from "./index";

describe("agent-api handoff descriptors", () => {
  it("exports read-only handoff resource descriptors", () => {
    expect(agentApiStatus.ready).toBe(true);
    expect(buildAgentHandoffResource("today")).toEqual({
      uri: "orbit://handoff/today",
      mimeType: "text/markdown",
      readOnly: true
    });
    expect(buildAgentHandoffResource({ kind: "project", project: "orbit" })).toEqual({
      uri: "orbit://handoff/project/orbit",
      mimeType: "text/markdown",
      readOnly: true
    });
  });

  it("reads a safe today handoff resource for external agents without raw payloads", () => {
    const orbitHome = mkdtempSync(join(tmpdir(), "orbit-agent-api-handoff-test-"));
    try {
      const database = openOrbitDatabase({ orbitHome });
      try {
        seedAgentReadyContext(database.db);
      } finally {
        database.close();
      }

      const resource = readAgentHandoffResource("today", {
        orbitHome,
        date: "2026-05-21",
        generatedAt: "2026-05-21T10:00:00.000Z"
      });

      expect(resource.descriptor).toEqual(buildAgentHandoffResource("today"));
      expect(resource.readyForAgent).toBe(true);
      expect(resource.included).toEqual({
        activity: 1,
        knowledge: 1,
        memory: 1,
        recommendations: 1,
        evidence: 4
      });
      expect(resource.excluded.total).toBe(0);
      expect(resource.content).toContain("# Orbit Handoff");
      expect(resource.content).toContain("Goal 7 implementation");
      expect(resource.content).toContain("Handoff defaults");
      expect(resource.content).not.toContain("RAW_AGENT_API_EVENT_TEXT");
    } finally {
      rmSync(orbitHome, { recursive: true, force: true });
    }
  });
});

const baseTime = "2026-05-21T09:00:00.000Z";

function seedAgentReadyContext(db: import("better-sqlite3").Database): void {
  const source = new SourceRepository(db);
  const events = new EventRepository(db);
  const activity = new ActivityRepository(db);
  const knowledge = new KnowledgeRepository(db);
  const memory = new MemoryRepository(db);
  const recommendations = new RecommendationRepository(db);
  const permissionScope = defaultPermissionScopeForSource("codex", "internal");
  permissionScope.canExportToAgent = true;
  source.upsertSource({
    id: "fixture_codex",
    kind: "codex",
    displayName: "Codex fixture",
    enabled: true,
    paused: false,
    defaultSensitivity: "internal",
    permissionScope,
    createdAt: baseTime,
    updatedAt: baseTime
  });
  const event = makeEvent();
  events.upsertEvent(event);
  activity.upsertActivitySession(makeActivity(event));
  knowledge.upsertKnowledgeArtifact(makeKnowledge(event));
  memory.upsertMemory(makeMemory(event));
  recommendations.upsertRecommendation(makeRecommendation(event));
}

function makeEvent(): Event {
  return {
    id: "evt_agent_api",
    schemaVersion: 1,
    source: {
      kind: "codex",
      adapterId: "fixture_codex",
      externalId: "evt_agent_api",
      pointer: "codex://safe.jsonl#evt_agent_api"
    },
    occurredAt: baseTime,
    observedAt: baseTime,
    actor: { role: "user", displayName: "Fixture User" },
    context: { app: "Codex", project: "orbit", repository: "orbit" },
    type: "message",
    content: {
      title: "Agent API event",
      text: "RAW_AGENT_API_EVENT_TEXT should not appear in the agent handoff"
    },
    privacy: {
      sensitivity: "internal",
      retentionPolicyId: "default",
      redactionState: "none"
    },
    hash: hashObject({ id: "evt_agent_api" })
  };
}

function makeActivity(event: Event): ActivitySession {
  return {
    id: "act_agent_api",
    schemaVersion: 1,
    title: "Goal 7 implementation",
    startAt: baseTime,
    endAt: "2026-05-21T09:15:00.000Z",
    durationSeconds: 900,
    sourceKinds: ["codex"],
    apps: ["Codex"],
    eventCount: 1,
    eventIds: [event.id],
    project: "orbit",
    summary: "Implemented safe Handoff Pack assembly.",
    evidence: [evidenceFromEvent(event, "Safe event summary")],
    localState: { rawAvailable: false, indexed: true },
    privacy: { sensitivity: "internal", retentionPolicyId: "default" },
    createdAt: baseTime,
    updatedAt: baseTime
  };
}

function makeKnowledge(event: Event): KnowledgeArtifact {
  return {
    id: "kn_agent_api",
    schemaVersion: 1,
    type: "decision_record",
    title: "Handoff Pack decision",
    status: "confirmed",
    metadata: {
      apps: ["Codex"],
      projects: ["orbit"],
      sourceSessionIds: ["act_agent_api"],
      language: "en"
    },
    content: {
      description: "Handoff Pack should be reviewable before sharing.",
      keyInsights: ["Confirmed context only."],
      decisions: ["Ship CLI/Desktop handoff before MCP."],
      blockers: [],
      markdown: "Safe confirmed knowledge."
    },
    evidence: [evidenceFromEvent(event, "Safe knowledge summary")],
    confidence: 0.9,
    createdAt: baseTime,
    updatedAt: baseTime
  };
}

function makeMemory(event: Event): Memory {
  return {
    id: "mem_agent_api",
    schemaVersion: 1,
    kind: "decision",
    title: "Handoff defaults",
    body: "Handoff excludes raw Event text by default.",
    status: "confirmed",
    scope: { project: "orbit", sourceKinds: ["codex"] },
    tags: ["handoff"],
    evidence: [evidenceFromEvent(event, "Safe memory summary")],
    confidence: 0.9,
    createdAt: baseTime,
    updatedAt: baseTime
  };
}

function makeRecommendation(event: Event): Recommendation {
  return {
    id: "rec_agent_api",
    schemaVersion: 1,
    type: "risk",
    title: "Keep Handoff Pack privacy-safe",
    explanation: "Raw payloads should stay out of default agent handoffs.",
    suggestedAction: "Review the pack before pasting it into a new agent session.",
    confidence: 0.86,
    impact: "high",
    status: "new",
    evidence: [evidenceFromEvent(event, "Safe recommendation summary")],
    createdAt: baseTime
  };
}
