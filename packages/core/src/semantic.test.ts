import { describe, expect, it } from "vitest";
import type { Event } from "./index";
import {
  buildActivitySessions,
  draftKnowledgeArtifact,
  extractMemoryCandidates,
  generateRecommendations
} from "./index";

describe("semantic pipeline", () => {
  it("builds sessions, knowledge, memory candidates, and recommendations", () => {
    const events = [makeEvent("1", "message"), makeEvent("2", "todo")];
    const sessions = buildActivitySessions(events);
    expect(sessions).toHaveLength(1);

    const artifact = draftKnowledgeArtifact({ session: sessions[0]!, events });
    expect(artifact.evidence.length).toBe(2);
    expect(artifact.status).toBe("draft");

    const memories = extractMemoryCandidates([artifact]);
    expect(memories).toHaveLength(0);

    const confirmedArtifact = { ...artifact, status: "confirmed" as const };
    const confirmedMemories = extractMemoryCandidates([confirmedArtifact]);
    expect(confirmedMemories[0]?.status).toBe("needs_review");

    const recommendations = generateRecommendations({
      events,
      sessions,
      artifacts: [artifact],
      memories: confirmedMemories
    });
    expect(recommendations.some((item) => item.type === "follow_up")).toBe(true);
    expect(recommendations.every((item) => item.evidence.length > 0)).toBe(true);
  });
});

function makeEvent(id: string, type: Event["type"]): Event {
  return {
    id: `event_${id}`,
    schemaVersion: 1,
    source: {
      kind: "codex",
      adapterId: "fixture_codex",
      externalId: id,
      pointer: `fixture://codex/day#${id}`
    },
    occurredAt: `2026-05-20T09:0${id}:00.000Z`,
    observedAt: `2026-05-20T09:0${id}:00.000Z`,
    context: {
      app: "Codex",
      project: "orbit",
      threadId: "thread"
    },
    type,
    content: {
      title: type === "todo" ? "Follow up on adapter" : "Inspect architecture"
    },
    privacy: {
      sensitivity: "internal",
      retentionPolicyId: "default",
      redactionState: "none"
    },
    hash: `hash_${id}`
  };
}
