import { describe, expect, it } from "vitest";
import type {
  ActivitySession,
  EvidenceRef,
  KnowledgeArtifact,
  Memory,
  Recommendation,
  ReviewStatus
} from "../index";
import { buildHandoffPack, explainHandoffExclusion, formatHandoffMarkdown } from "../index";
import type { HandoffEventSafety } from "./handoffPack";

const baseTime = "2026-05-21T08:00:00.000Z";

describe("handoff pack", () => {
  it("builds an agent-ready dogfood handoff with attempted work, next steps, and Chinese markdown", () => {
    const pack = buildHandoffPack({
      kind: "today",
      objective: "接手 Orbit 半天 dogfood",
      date: "2026-05-21",
      generatedAt: baseTime,
      activitySessions: [
        makeActivity({
          id: "act_done",
          title: "Orbit: 真实 Screen/OCR 采集",
          summary: "已完成手动 Screen/OCR 采集并进入 Activity。 / 下一步确认中文 Knowledge。"
        })
      ],
      knowledgeArtifacts: [
        makeKnowledge({
          status: "confirmed",
          eventId: "evt_1",
          content: {
            description: "真实本地来源已经生成可审阅中文 Knowledge。",
            keyInsights: [
              "已完成：Screen/OCR 事件进入 Activity。",
              "下一步：确认 Memory 后再交给 Agent。"
            ],
            decisions: ["默认 Handoff 不导出 raw screen/OCR payload。"],
            blockers: ["阻塞：Memory 仍待用户确认。"],
            markdown: "确认后的中文 Knowledge。"
          }
        })
      ],
      memories: [
        makeMemory({
          status: "confirmed",
          eventId: "evt_1",
          body: "Orbit dogfood handoff must include safety boundaries and next steps."
        })
      ],
      recommendations: [
        makeRecommendation({
          status: "new",
          eventId: "evt_1",
          title: "确认 Memory 后再交给 Agent",
          suggestedAction: "在 Memory 页面确认候选项，然后重新生成 Handoff。"
        })
      ],
      eventSafety: new Map([["evt_1", makeEventSafety({ eventId: "evt_1" })]])
    });

    expect(pack.currentState).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Current objective: 接手 Orbit 半天 dogfood"),
        expect.stringContaining("Confirmed knowledge ready for agent handoff: 1"),
        expect.stringContaining("Open blockers or risks: 2")
      ])
    );
    expect(pack.completedOrAttempted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: expect.stringContaining("已完成"),
          status: "completed"
        }),
        expect.objectContaining({
          title: expect.stringContaining("下一步"),
          status: "attempted"
        })
      ])
    );
    expect(pack.nextSteps).toEqual([
      expect.objectContaining({
        title: "确认 Memory 后再交给 Agent",
        action: "在 Memory 页面确认候选项，然后重新生成 Handoff。"
      })
    ]);

    const markdown = formatHandoffMarkdown(pack, { language: "zh-CN" });
    expect(markdown).toContain("# Orbit 交班包");
    expect(markdown).toContain("## 当前状态");
    expect(markdown).toContain("## 已完成 / 已尝试");
    expect(markdown).toContain("## 建议下一步");
    expect(markdown).toContain("## 安全边界");
    expect(markdown).toContain("当前目标：接手 Orbit 半天 dogfood");
    expect(markdown).toContain("用户审阅后再分享");
    expect(markdown).toContain("已完成");
    expect(markdown).toContain("默认 Handoff 不导出 raw screen/OCR payload");
    expect(markdown).not.toContain("RAW_EVENT_TEXT");
  });

  it("builds a default today handoff from confirmed and evidence-backed objects", () => {
    const pack = buildHandoffPack({
      kind: "today",
      objective: "Continue Orbit development",
      date: "2026-05-21",
      generatedAt: baseTime,
      activitySessions: [makeActivity({ eventIds: ["evt_1"] })],
      knowledgeArtifacts: [makeKnowledge({ status: "confirmed", eventId: "evt_1" })],
      memories: [makeMemory({ status: "confirmed", eventId: "evt_1" })],
      recommendations: [makeRecommendation({ status: "new", eventId: "evt_1" })],
      eventSafety: new Map([["evt_1", makeEventSafety({ eventId: "evt_1" })]])
    });

    expect(pack.kind).toBe("today");
    expect(pack.recentActivity).toHaveLength(1);
    expect(pack.confirmedKnowledge).toHaveLength(1);
    expect(pack.activeMemories).toHaveLength(1);
    expect(pack.decisions).toHaveLength(2);
    expect(pack.blockersAndRisks).toHaveLength(2);
    expect(pack.recommendedNextActions).toHaveLength(1);
    expect(pack.evidenceIndex.length).toBeGreaterThan(0);
    expect(pack.safetyBoundaries.map((boundary) => boundary.kind)).toEqual(
      expect.arrayContaining(["review_required", "no_side_effects", "no_raw_payloads"])
    );
    expect(JSON.stringify(pack)).not.toContain("RAW_EVENT_TEXT");
  });

  it("excludes draft, unconfirmed, failed-redaction, secret, and non-exportable evidence", () => {
    const pack = buildHandoffPack({
      kind: "today",
      objective: "Continue Orbit development",
      date: "2026-05-21",
      generatedAt: baseTime,
      activitySessions: [
        makeActivity({ id: "act_secret", eventIds: ["evt_secret"] }),
        makeActivity({ id: "act_blocked", eventIds: ["evt_blocked"] })
      ],
      knowledgeArtifacts: [makeKnowledge({ status: "draft", eventId: "evt_ok" })],
      memories: [makeMemory({ status: "needs_review", eventId: "evt_ok" })],
      recommendations: [makeRecommendation({ status: "new", eventId: "evt_failed" })],
      eventSafety: new Map([
        ["evt_ok", makeEventSafety({ eventId: "evt_ok" })],
        ["evt_secret", makeEventSafety({ eventId: "evt_secret", sensitivity: "secret" })],
        ["evt_blocked", makeEventSafety({ eventId: "evt_blocked", canExportToAgent: false })],
        ["evt_failed", makeEventSafety({ eventId: "evt_failed", redactionState: "failed" })]
      ])
    });

    expect(pack.recentActivity).toHaveLength(0);
    expect(pack.confirmedKnowledge).toHaveLength(0);
    expect(pack.activeMemories).toHaveLength(0);
    expect(pack.recommendedNextActions).toHaveLength(0);
    expect(pack.evidenceIndex).toHaveLength(0);
    expect(pack.excluded.map((item) => item.reason)).toEqual(
      expect.arrayContaining([
        "draft_knowledge",
        "memory_not_confirmed",
        "secret_content",
        "failed_redaction",
        "source_export_blocked"
      ])
    );
  });

  it("includes safe perception summaries while excluding blocked evidence from the same object", () => {
    const pack = buildHandoffPack({
      kind: "today",
      objective: "Continue Orbit development",
      date: "2026-05-21",
      generatedAt: baseTime,
      activitySessions: [
        makeActivity({
          id: "act_perception",
          eventIds: ["evt_screen", "evt_transcript_blocked"],
          sourceKinds: ["screen", "transcript"],
          evidence: [
            makeEvidence("evt_screen", "screen"),
            makeEvidence("evt_transcript_blocked", "transcript")
          ]
        })
      ],
      knowledgeArtifacts: [],
      memories: [],
      recommendations: [],
      eventSafety: new Map([
        [
          "evt_screen",
          makeEventSafety({
            eventId: "evt_screen",
            sourceAdapterId: "perception_screen",
            sourceKind: "screen",
            sourcePointer: "screen://capture/day/frame#1",
            sensitivity: "confidential",
            redactionState: "redacted",
            canExportToAgent: true
          })
        ],
        [
          "evt_transcript_blocked",
          makeEventSafety({
            eventId: "evt_transcript_blocked",
            sourceAdapterId: "perception_transcript",
            sourceKind: "transcript",
            sourcePointer: "transcript://meeting/day/audio#1",
            sensitivity: "confidential",
            canExportToAgent: false
          })
        ]
      ])
    });

    expect(pack.recentActivity).toHaveLength(1);
    expect(pack.recentActivity[0]?.evidenceIds).toHaveLength(1);
    expect(pack.evidenceIndex.map((item) => item.sourcePointer)).toEqual([
      "screen://capture/day/frame#1"
    ]);
    expect(pack.excluded).toEqual([
      {
        objectType: "activity",
        objectId: "act_perception",
        reason: "source_export_blocked"
      }
    ]);
    expect(JSON.stringify(pack)).not.toContain("transcript://meeting/day/audio#1");
  });

  it("formats markdown without raw event payloads", () => {
    const pack = buildHandoffPack({
      kind: "today",
      objective: "Continue Orbit development",
      date: "2026-05-21",
      generatedAt: baseTime,
      activitySessions: [makeActivity({ eventIds: ["evt_1"] })],
      knowledgeArtifacts: [makeKnowledge({ status: "confirmed", eventId: "evt_1" })],
      memories: [makeMemory({ status: "confirmed", eventId: "evt_1" })],
      recommendations: [makeRecommendation({ status: "new", eventId: "evt_1" })],
      eventSafety: new Map([["evt_1", makeEventSafety({ eventId: "evt_1" })]])
    });

    const markdown = formatHandoffMarkdown(pack);

    expect(markdown).toContain("# Orbit Handoff");
    expect(markdown).toContain("## Objective");
    expect(markdown).toContain("## Current State");
    expect(markdown).toContain("## Recent Activity");
    expect(markdown).toContain("## Confirmed Knowledge");
    expect(markdown).toContain("## Active Memories");
    expect(markdown).toContain("## Decisions");
    expect(markdown).toContain("## Blockers And Risks");
    expect(markdown).toContain("## Recommended Next Actions");
    expect(markdown).toContain("## Safety Boundaries");
    expect(markdown).toContain("## Evidence Index");
    expect(markdown).not.toContain("RAW_EVENT_TEXT");
  });

  it("exports desktop observation summaries and source pointers without raw window payloads", () => {
    const pack = buildHandoffPack({
      kind: "today",
      objective: "Continue Orbit development",
      date: "2026-05-21",
      generatedAt: baseTime,
      activitySessions: [
        makeActivity({
          id: "act_desktop",
          eventIds: ["evt_desktop"],
          sourceKinds: ["desktop"],
          apps: ["Cursor"],
          summary: "Window focus observed in Cursor while working on Goal 2.",
          evidence: [
            {
              ...makeEvidence("evt_desktop", "desktop"),
              sourcePointer: "desktop://window/runtime#2",
              excerpt: "RAW_PRIVATE_WINDOW_TITLE: orbit - secret token"
            }
          ]
        })
      ],
      knowledgeArtifacts: [],
      memories: [],
      recommendations: [],
      eventSafety: new Map([
        [
          "evt_desktop",
          makeEventSafety({
            eventId: "evt_desktop",
            sourceAdapterId: "desktop_observation",
            sourceKind: "desktop",
            sourcePointer: "desktop://window/runtime#2",
            sensitivity: "confidential",
            redactionState: "none",
            canExportToAgent: true
          })
        ]
      ])
    });

    expect(pack.recentActivity).toEqual([
      expect.objectContaining({
        sourceKinds: ["desktop"],
        apps: ["Cursor"],
        summary: "Window focus observed in Cursor while working on Goal 2."
      })
    ]);
    expect(pack.evidenceIndex).toEqual([
      expect.objectContaining({
        sourceKind: "desktop",
        sourcePointer: "desktop://window/runtime#2"
      })
    ]);
    expect(JSON.stringify(pack)).not.toContain("RAW_PRIVATE_WINDOW_TITLE");
    expect(formatHandoffMarkdown(pack)).not.toContain("secret token");
  });

  it("explains exclusion reasons and includes next actions in markdown", () => {
    const pack = buildHandoffPack({
      kind: "today",
      objective: "Continue Orbit development",
      date: "2026-05-21",
      generatedAt: baseTime,
      activitySessions: [makeActivity({ id: "act_blocked", eventIds: ["evt_blocked"] })],
      knowledgeArtifacts: [makeKnowledge({ status: "draft", eventId: "evt_ok" })],
      memories: [makeMemory({ status: "needs_review", eventId: "evt_ok" })],
      recommendations: [],
      eventSafety: new Map([
        ["evt_ok", makeEventSafety({ eventId: "evt_ok" })],
        ["evt_blocked", makeEventSafety({ eventId: "evt_blocked", canExportToAgent: false })]
      ])
    });

    expect(explainHandoffExclusion("draft_knowledge")).toEqual({
      title: "Knowledge still needs review",
      description: "Draft or needs-review Knowledge is not treated as agent-ready context.",
      nextAction: "Review, edit if needed, then confirm the Knowledge Artifact."
    });

    const markdown = formatHandoffMarkdown(pack);
    expect(markdown).toContain("## Excluded From Handoff");
    expect(markdown).toContain("Knowledge still needs review");
    expect(markdown).toContain("Review, edit if needed, then confirm the Knowledge Artifact.");
    expect(markdown).toContain("Source export is blocked");
    expect(markdown).not.toContain("RAW_EVENT_TEXT");
  });
});

function makeEvidence(
  eventId: string,
  sourceKind: EvidenceRef["sourceKind"] = "codex"
): EvidenceRef {
  return {
    eventId,
    sourceKind,
    sourcePointer: `${sourceKind}://session.jsonl#${eventId}`,
    timestamp: baseTime,
    excerpt: "Reviewed summary, not RAW_EVENT_TEXT"
  };
}

function makeEventSafety(
  overrides: Partial<HandoffEventSafety> & { eventId: string }
): HandoffEventSafety {
  return {
    eventId: overrides.eventId,
    sourceAdapterId: overrides.sourceAdapterId ?? "fixture_codex",
    sourceKind: overrides.sourceKind ?? "codex",
    sourcePointer: overrides.sourcePointer ?? `codex://session.jsonl#${overrides.eventId}`,
    timestamp: overrides.timestamp ?? baseTime,
    sensitivity: overrides.sensitivity ?? "internal",
    redactionState: overrides.redactionState ?? "none",
    canExportToAgent: overrides.canExportToAgent ?? true
  };
}

function makeActivity(overrides: Partial<ActivitySession> = {}): ActivitySession {
  const eventIds = overrides.eventIds ?? ["evt_1"];
  return {
    id: overrides.id ?? "act_1",
    schemaVersion: 1,
    title: overrides.title ?? "Goal 7 planning",
    startAt: overrides.startAt ?? baseTime,
    endAt: overrides.endAt ?? baseTime,
    durationSeconds: overrides.durationSeconds ?? 300,
    sourceKinds: overrides.sourceKinds ?? ["codex"],
    apps: overrides.apps ?? ["Codex"],
    eventCount: overrides.eventCount ?? eventIds.length,
    eventIds,
    project: overrides.project ?? "orbit",
    summary: overrides.summary ?? "Prepared Goal 7 handoff implementation plan",
    evidence: overrides.evidence ?? eventIds.map((eventId) => makeEvidence(eventId)),
    localState: overrides.localState ?? { rawAvailable: false, indexed: true },
    privacy: overrides.privacy ?? { sensitivity: "internal", retentionPolicyId: "default" },
    createdAt: overrides.createdAt ?? baseTime,
    updatedAt: overrides.updatedAt ?? baseTime
  };
}

function makeKnowledge(
  overrides: Partial<KnowledgeArtifact> & { status: ReviewStatus; eventId?: string }
): KnowledgeArtifact {
  const eventId = overrides.eventId ?? "evt_1";
  return {
    id: overrides.id ?? `kn_${overrides.status}`,
    schemaVersion: 1,
    type: overrides.type ?? "decision_record",
    title: overrides.title ?? "Handoff Pack is the Goal 7 product surface",
    status: overrides.status,
    metadata: overrides.metadata ?? {
      apps: ["Codex"],
      projects: ["orbit"],
      sourceSessionIds: ["act_1"],
      language: "en"
    },
    content: overrides.content ?? {
      description: "Goal 7 should ship Handoff Pack before broader perception capture.",
      keyInsights: ["Handoff defaults stay privacy-safe."],
      decisions: ["Ship CLI and Desktop handoff before MCP."],
      blockers: ["Package scripts need root-aware Vitest execution."],
      markdown: "Confirmed summary without raw payloads."
    },
    evidence: overrides.evidence ?? [makeEvidence(eventId)],
    confidence: overrides.confidence ?? 0.88,
    createdAt: overrides.createdAt ?? baseTime,
    updatedAt: overrides.updatedAt ?? baseTime
  };
}

function makeMemory(
  overrides: Partial<Memory> & { status: ReviewStatus; eventId?: string }
): Memory {
  const eventId = overrides.eventId ?? "evt_1";
  return {
    id: overrides.id ?? `mem_${overrides.status}`,
    schemaVersion: 1,
    kind: overrides.kind ?? "decision",
    title: overrides.title ?? "Orbit handoff defaults",
    body: overrides.body ?? "Orbit handoffs exclude raw payloads by default.",
    status: overrides.status,
    scope: overrides.scope ?? { project: "orbit", sourceKinds: ["codex"] },
    tags: overrides.tags ?? ["handoff"],
    evidence: overrides.evidence ?? [makeEvidence(eventId)],
    confidence: overrides.confidence ?? 0.9,
    createdAt: overrides.createdAt ?? baseTime,
    updatedAt: overrides.updatedAt ?? baseTime
  };
}

function makeRecommendation(
  overrides: Partial<Recommendation> & { status: Recommendation["status"]; eventId?: string }
): Recommendation {
  const eventId = overrides.eventId ?? "evt_1";
  const recommendation: Recommendation = {
    id: overrides.id ?? `rec_${overrides.status}`,
    schemaVersion: 1,
    type: overrides.type ?? "risk",
    title: overrides.title ?? "Keep screen capture out of Goal 7",
    explanation:
      overrides.explanation ??
      "Perception should stay research-only until permissions are designed.",
    suggestedAction:
      overrides.suggestedAction ?? "Implement disabled descriptors and research doc first.",
    confidence: overrides.confidence ?? 0.82,
    impact: overrides.impact ?? "high",
    status: overrides.status,
    evidence: overrides.evidence ?? [makeEvidence(eventId)],
    createdAt: overrides.createdAt ?? baseTime
  };
  if (overrides.dueAt) recommendation.dueAt = overrides.dueAt;
  return recommendation;
}
