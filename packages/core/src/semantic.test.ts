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

  it("keeps live observation sessions stable and splits them after idle gaps", () => {
    const first = makeObservationEvent("1", "2026-05-21T09:00:00.000Z", "Terminal");
    const second = makeObservationEvent("2", "2026-05-21T09:04:00.000Z", "Cursor");
    const updated = buildActivitySessions([first, second], {
      now: new Date("2026-05-21T09:05:00.000Z")
    });
    const extended = buildActivitySessions(
      [first, second, makeObservationEvent("3", "2026-05-21T09:08:00.000Z", "Orbit")],
      { now: new Date("2026-05-21T09:09:00.000Z") }
    );

    expect(updated).toHaveLength(1);
    expect(extended).toHaveLength(1);
    expect(extended[0]?.id).toBe(updated[0]?.id);
    expect(extended[0]?.eventCount).toBe(3);
    expect(extended[0]?.localState.closed).toBe(false);

    const split = buildActivitySessions(
      [first, second, makeObservationEvent("4", "2026-05-21T09:25:00.000Z", "Terminal")],
      { now: new Date("2026-05-21T09:45:00.000Z") }
    );

    expect(split).toHaveLength(2);
    expect(split[0]?.localState.closed).toBe(true);
    expect(split[1]?.localState.closed).toBe(true);
  });

  it("merges continuous app and window focus events into one desktop Activity with evidence", () => {
    const events = [
      makeObservationEvent("app_cursor", "2026-05-21T09:00:00.000Z", "Cursor", {
        type: "app_focus",
        pointer: "desktop://app-focus/runtime#1",
        title: "Focused Cursor",
        summary: "Frontmost app changed to Cursor."
      }),
      makeObservationEvent("window_cursor", "2026-05-21T09:00:02.000Z", "Cursor", {
        type: "window_focus",
        pointer: "desktop://window/runtime#2",
        windowTitle: "orbit - Goal 2",
        title: "Focused window in Cursor",
        summary: "Window focus observed in Cursor: orbit - Goal 2"
      }),
      makeObservationEvent("app_terminal", "2026-05-21T09:07:00.000Z", "Terminal", {
        type: "app_focus",
        pointer: "desktop://app-focus/runtime#3",
        title: "Focused Terminal",
        summary: "Frontmost app changed to Terminal."
      })
    ];

    const sessions = buildActivitySessions(events, {
      now: new Date("2026-05-21T09:08:00.000Z")
    });

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toEqual(
      expect.objectContaining({
        sourceKinds: ["desktop"],
        apps: ["Cursor", "Terminal"],
        eventCount: 3,
        eventIds: events.map((event) => event.id)
      })
    );
    expect(sessions[0]?.evidence.map((ref) => ref.sourcePointer)).toEqual([
      "desktop://app-focus/runtime#1",
      "desktop://window/runtime#2",
      "desktop://app-focus/runtime#3"
    ]);
    expect(sessions[0]?.summary).toContain("Window focus observed in Cursor: orbit - Goal 2");
  });

  it("turns perception follow-ups and visible risks into review-only recommendations", () => {
    const events = [
      makePerceptionEvent(
        "screen_bug",
        "screen",
        "A Sources page bug note and Settings scrolling fix are visible."
      ),
      makePerceptionEvent(
        "transcript_followup",
        "transcript",
        "Follow up: verify context today and Handoff exclusions."
      )
    ];
    const sessions = buildActivitySessions(events, {
      now: new Date("2026-05-21T10:30:00.000Z")
    });
    const artifacts = sessions.map((session) =>
      draftKnowledgeArtifact({
        session,
        events: events.filter((event) => session.eventIds.includes(event.id))
      })
    );
    const recommendations = generateRecommendations({
      events,
      sessions,
      artifacts,
      memories: []
    });

    expect(recommendations.some((item) => item.type === "risk")).toBe(true);
    expect(recommendations.some((item) => item.type === "follow_up")).toBe(true);
    expect(recommendations.some((item) => item.type === "context_needed")).toBe(true);
    expect(artifacts.flatMap((artifact) => artifact.content.followUps ?? [])).not.toHaveLength(0);
    expect(artifacts[0]?.content.markdown).toContain("## Evidence");
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

function makeObservationEvent(
  id: string,
  occurredAt: string,
  app: string,
  overrides: {
    type?: "app_focus" | "window_focus";
    pointer?: string;
    title?: string;
    summary?: string;
    windowTitle?: string;
  } = {}
): Event {
  return {
    id: `obs_event_${id}`,
    schemaVersion: 1,
    source: {
      kind: "desktop",
      adapterId: "desktop_observation",
      externalId: id,
      pointer: overrides.pointer ?? `desktop://app-focus/test#${id}`
    },
    occurredAt,
    observedAt: occurredAt,
    context: {
      app,
      windowTitle: overrides.windowTitle ?? `${app} window`
    },
    type: overrides.type ?? "window_focus",
    content: {
      title: overrides.title ?? `Focused ${app}`,
      summary: overrides.summary ?? `Window focus observed in ${app}.`
    },
    privacy: {
      sensitivity: "confidential",
      retentionPolicyId: "observation_default",
      redactionState: "none"
    },
    hash: `obs_hash_${id}`
  };
}

function makePerceptionEvent(
  id: string,
  sourceKind: "screen" | "transcript",
  summary: string
): Event {
  return {
    id: `perception_event_${id}`,
    schemaVersion: 1,
    source: {
      kind: sourceKind,
      adapterId: `perception_${sourceKind}`,
      externalId: id,
      pointer: `${sourceKind}://fixture/${id}`
    },
    occurredAt: `2026-05-21T10:0${sourceKind === "screen" ? "0" : "1"}:00.000Z`,
    observedAt: `2026-05-21T10:0${sourceKind === "screen" ? "0" : "1"}:00.000Z`,
    context: {
      app: sourceKind === "screen" ? "Cursor" : "Google Meet",
      threadId: "perception-fixture"
    },
    type: sourceKind === "screen" ? "screen_observation" : "transcript_segment",
    content: {
      title: `${sourceKind} evidence`,
      summary
    },
    classification: {
      topics: ["perception"],
      entities: [],
      confidence: 0.82
    },
    privacy: {
      sensitivity: "confidential",
      retentionPolicyId: "perception_summary_only",
      redactionState: "redacted"
    },
    hash: `perception_hash_${id}`
  };
}
