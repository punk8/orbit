import { describe, expect, it } from "vitest";
import type { Event } from "./index";
import {
  buildActivitySessions,
  draftKnowledgeArtifact,
  extractMemoryCandidates,
  generateRecommendations,
  buildPerceptionEvidencePacket
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

  it("stores explainable close reasons and quality signals for perception sessions", () => {
    const events = [
      makePerceptionFrameEvent("frame_1", "screen", "2026-05-21T10:00:00.000Z"),
      makePerceptionFrameEvent("ocr_1", "ocr", "2026-05-21T10:00:00.000Z", {
        summary:
          "Orbit Goal E screen OCR shows follow up work, visible error context, and enough Chinese/English evidence for a high quality Activity session."
      }),
      makeProtectedObservationEvent("protected", "2026-05-21T10:04:00.000Z"),
      makePerceptionFrameEvent("frame_2", "screen", "2026-05-21T10:07:00.000Z")
    ];

    const sessions = buildActivitySessions(events, {
      now: new Date("2026-05-21T10:30:00.000Z")
    });

    expect(sessions).toHaveLength(2);
    expect(sessions[0]?.localState.closeReason).toBe("protected_app_gap");
    expect(sessions[0]?.localState.qualityScore).toBeGreaterThanOrEqual(0.35);
    expect(sessions[0]?.localState.qualitySignals).toMatchObject({
      frameCount: 1,
      ocrTextChars: expect.any(Number),
      hasFollowUpOrRisk: true,
      redactionSafe: true,
      isLowQuality: false
    });
    expect(sessions[1]?.localState.closeReason).toBe("idle_timeout");
    expect(sessions[1]?.localState.qualitySignals?.isLowQuality).toBe(true);
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

  it("drafts Chinese Activity-level Knowledge from safe perception packets without raw payloads", () => {
    const events = [
      makePerceptionFrameEvent("frame_goal_f_1", "screen", "2026-05-21T11:00:00.000Z", {
        summary: "Cursor window shows Orbit Goal F implementation progress.",
        metadata: {
          frameHash: "goal_f_frame_1",
          rawFrameStored: false,
          rawFrameRef: "file:///private/raw-screen.png"
        }
      }),
      makePerceptionFrameEvent("ocr_goal_f_1", "ocr", "2026-05-21T11:01:00.000Z", {
        summary:
          "可见内容显示 Goal F 正在实现中文 Knowledge、Handoff 排除原因和待跟进检查，测试失败需要修复。",
        text: "RAW_OCR_TEXT should never appear in Knowledge",
        rawRef: "file:///private/raw-ocr.txt",
        metadata: {
          sourceFrameHash: "goal_f_frame_1",
          rawTextStored: true,
          rawTextRef: "file:///private/raw-ocr.txt"
        }
      }),
      makePerceptionFrameEvent("frame_goal_f_2", "screen", "2026-05-21T11:02:00.000Z", {
        summary: "Second frame confirms the same Activity continues.",
        metadata: {
          frameHash: "goal_f_frame_2",
          rawFrameStored: false
        }
      })
    ];
    const session = buildActivitySessions(events, {
      now: new Date("2026-05-21T11:30:00.000Z")
    })[0]!;

    const packet = buildPerceptionEvidencePacket({ session, events });
    const artifact = draftKnowledgeArtifact({ session, events, language: "zh-CN" });
    const memoriesFromDraft = extractMemoryCandidates([artifact]);
    const memoriesFromConfirmed = extractMemoryCandidates([
      { ...artifact, status: "confirmed" as const }
    ]);

    expect(packet.activitySessionId).toBe(session.id);
    expect(packet.frameCount).toBe(2);
    expect(packet.selectedOcrSnippets).toEqual([
      "可见内容显示 Goal F 正在实现中文 Knowledge、Handoff 排除原因和待跟进检查，测试失败需要修复。"
    ]);
    expect(JSON.stringify(packet)).not.toContain("raw-screen.png");
    expect(JSON.stringify(packet)).not.toContain("RAW_OCR_TEXT");
    expect(artifact.metadata.language).toBe("zh-CN");
    expect(artifact.title).toContain("知识");
    expect(artifact.content.markdown).toContain("## 元数据");
    expect(artifact.content.markdown).toContain("## 关键洞察");
    expect(artifact.content.markdown).toContain("## 来源 Activity Sessions");
    expect(artifact.content.markdown).not.toContain("RAW_OCR_TEXT");
    expect(artifact.content.markdown).not.toContain("raw-ocr.txt");
    expect(memoriesFromDraft).toHaveLength(0);
    expect(memoriesFromConfirmed[0]?.status).toBe("needs_review");
  });

  it("detects Chinese visible errors, follow-ups, and context gaps from perception evidence", () => {
    const events = [
      makePerceptionFrameEvent("frame_cn_1", "screen", "2026-05-21T12:00:00.000Z", {
        summary: "Orbit pipeline run is visible in Terminal."
      }),
      makePerceptionFrameEvent("ocr_cn_1", "ocr", "2026-05-21T12:01:00.000Z", {
        summary: "终端显示测试失败，需要待跟进 Handoff raw payload 排除原因，并补充上下文缺口。",
        metadata: { sourceFrameHash: "frame_cn_1", rawTextStored: false }
      })
    ];
    const sessions = buildActivitySessions(events, {
      now: new Date("2026-05-21T12:30:00.000Z")
    });
    const recommendations = generateRecommendations({
      events,
      sessions,
      artifacts: [],
      memories: []
    });

    expect(recommendations.some((item) => item.type === "risk")).toBe(true);
    expect(recommendations.some((item) => item.type === "follow_up")).toBe(true);
    expect(recommendations.some((item) => item.type === "context_needed")).toBe(true);
    expect(recommendations.every((item) => item.evidence.length > 0)).toBe(true);
    expect(JSON.stringify(recommendations)).toContain("summary/source pointers only");
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

function makePerceptionFrameEvent(
  id: string,
  sourceKind: "screen" | "ocr",
  occurredAt: string,
  contentOverrides: Partial<Event["content"]> = {}
): Event {
  const frameHash = id.replace("ocr", "frame");
  return {
    id: `perception_frame_event_${id}`,
    schemaVersion: 1,
    source: {
      kind: sourceKind,
      adapterId: `perception_${sourceKind}`,
      pointer:
        sourceKind === "screen"
          ? `screen://capture/test/${frameHash}`
          : `ocr://capture/test/${frameHash}`
    },
    occurredAt,
    observedAt: occurredAt,
    context: {
      app: "Cursor",
      threadId: "perception-quality"
    },
    type: sourceKind === "screen" ? "screen_observation" : "ocr_text",
    content: {
      title: sourceKind === "screen" ? "Screen frame" : "OCR text",
      summary: sourceKind === "screen" ? "Screen frame observed." : "OCR text observed.",
      metadata:
        sourceKind === "screen"
          ? { frameHash, rawFrameStored: false }
          : { sourceFrameHash: frameHash, rawTextStored: false },
      ...contentOverrides
    },
    privacy: {
      sensitivity: "confidential",
      retentionPolicyId: "perception_summary_only",
      redactionState: "none"
    },
    hash: `perception_frame_hash_${id}`
  };
}

function makeProtectedObservationEvent(id: string, occurredAt: string): Event {
  return {
    id: `protected_event_${id}`,
    schemaVersion: 1,
    source: {
      kind: "desktop",
      adapterId: "desktop_observation",
      pointer: `desktop://app-focus/protected#${id}`
    },
    occurredAt,
    observedAt: occurredAt,
    context: {
      app: "1Password",
      threadId: "perception-quality"
    },
    type: "app_focus",
    content: {
      title: "Focused protected app 1Password",
      summary: "Protected app was focused; semantic window details were not stored."
    },
    privacy: {
      sensitivity: "internal",
      retentionPolicyId: "observation_default",
      redactionState: "redacted"
    },
    hash: `protected_hash_${id}`
  };
}
