import { describe, expect, it } from "vitest";
import type { Event, EventType, SourceKind } from "../index";
import { buildActivitySessions } from "./buildActivitySessions";

describe("Yansu-grade activity sessionizer", () => {
  it("keeps a long mixed meeting and coding stream as one deterministic session", () => {
    const events = [
      observation("long_00", "2026-05-21T09:00:00.000Z", {
        app: "Google Meet",
        type: "transcript_segment",
        sourceKind: "transcript",
        topic: "launch-review",
        summary: "Launch review meeting discusses Orbit sessionizer decisions and open risks."
      }),
      observation("long_01", "2026-05-21T09:08:00.000Z", {
        app: "Cursor",
        type: "screen_observation",
        sourceKind: "screen",
        topic: "launch-review",
        frameHash: "launch_frame_1",
        summary: "Cursor shows Orbit launch review notes and sessionizer implementation."
      }),
      observation("long_02", "2026-05-21T09:16:00.000Z", {
        app: "Cursor",
        type: "ocr_text",
        sourceKind: "ocr",
        topic: "launch-review",
        summary: "OCR: launch review sessionizer decisions, follow up owners, and next checks."
      }),
      observation("long_03", "2026-05-21T09:24:00.000Z", {
        app: "Terminal",
        type: "terminal_output_summary",
        sourceKind: "desktop",
        topic: "launch-review",
        summary: "Tests run for Orbit launch review sessionizer work."
      }),
      observation("long_04", "2026-05-21T09:32:00.000Z", {
        app: "Google Meet",
        type: "audio_segment",
        sourceKind: "audio",
        topic: "launch-review",
        summary: "Meeting audio marker continues the same launch review discussion."
      }),
      observation("long_05", "2026-05-21T09:48:00.000Z", {
        app: "Cursor",
        type: "screen_observation",
        sourceKind: "screen",
        topic: "launch-review",
        frameHash: "launch_frame_2",
        rawAvailable: true,
        summary: "Cursor confirms launch review code and acceptance checklist."
      }),
      observation("long_06", "2026-05-21T09:58:00.000Z", {
        app: "Google Meet",
        type: "transcript_segment",
        sourceKind: "transcript",
        topic: "launch-review",
        summary: "Decision: keep the long launch review session together with evidence."
      })
    ];

    const first = buildActivitySessions(events, {
      now: new Date("2026-05-21T10:20:00.000Z")
    });
    const second = buildActivitySessions([...events].reverse(), {
      now: new Date("2026-05-21T10:20:00.000Z")
    });

    expect(first).toHaveLength(1);
    expect(second).toEqual(first);
    expect(first[0]).toEqual(
      expect.objectContaining({
        topic: "launch-review",
        project: "orbit",
        durationSeconds: 58 * 60,
        eventCount: events.length
      })
    );
    expect(first[0]?.apps).toEqual(["Google Meet", "Cursor", "Terminal"]);
    expect(first[0]?.localState).toMatchObject({
      rawAvailable: true,
      closed: true,
      closeReason: "idle_timeout",
      boundaryConfidence: 0.95,
      primaryApps: ["Google Meet", "Cursor", "Terminal"]
    });
    expect(first[0]?.localState.qualitySignals).toMatchObject({
      frameCount: 2,
      ocrPageCount: 1,
      eventCount: events.length,
      protectedSkipCount: 0,
      rawAvailable: true
    });
  });

  it("creates short sessions when app and OCR topic evidence clearly switches context", () => {
    const sessions = buildActivitySessions(
      [
        observation("short_1", "2026-05-21T10:00:00.000Z", {
          app: "Cursor",
          windowTitle: "orbit sessionizer",
          topic: "orbit-sessionizer",
          summary: "Implement Orbit activity sessionizer tests and boundary confidence."
        }),
        observation("short_2", "2026-05-21T10:02:00.000Z", {
          app: "Cursor",
          windowTitle: "orbit sessionizer",
          type: "ocr_text",
          sourceKind: "ocr",
          topic: "orbit-sessionizer",
          summary: "OCR text about Orbit sessionizer frame counts and protected skips."
        }),
        observation("short_3", "2026-05-21T10:04:00.000Z", {
          app: "Numbers",
          windowTitle: "expense report",
          topic: "expense-report",
          summary: "Expense report spreadsheet with hotel receipts and reimbursement totals."
        }),
        observation("short_4", "2026-05-21T10:06:00.000Z", {
          app: "Numbers",
          windowTitle: "expense report",
          type: "ocr_text",
          sourceKind: "ocr",
          topic: "expense-report",
          summary: "OCR text about receipts, tax totals, and finance reimbursement."
        })
      ],
      { now: new Date("2026-05-21T10:07:00.000Z") }
    );

    expect(sessions).toHaveLength(2);
    expect(sessions.map((session) => session.topic)).toEqual([
      "orbit-sessionizer",
      "expense-report"
    ]);
    expect(sessions[0]?.durationSeconds).toBe(120);
    expect(sessions[0]?.localState.closeReason).toBe("topic_shift");
    expect(sessions[0]?.localState.boundaryConfidence).toBeGreaterThanOrEqual(0.65);
    expect(sessions[1]?.durationSeconds).toBe(120);
  });

  it("uses idle gaps as high-confidence boundaries", () => {
    const sessions = buildActivitySessions(
      [
        observation("idle_1", "2026-05-21T11:00:00.000Z", {
          topic: "orbit-debugging",
          summary: "Debug Orbit perception cleanup."
        }),
        observation("idle_2", "2026-05-21T11:04:00.000Z", {
          topic: "orbit-debugging",
          summary: "Run Orbit perception cleanup tests."
        }),
        observation("idle_3", "2026-05-21T11:32:00.000Z", {
          topic: "orbit-debugging",
          summary: "Return to Orbit after lunch and inspect cleanup ledger."
        })
      ],
      { now: new Date("2026-05-21T11:33:00.000Z") }
    );

    expect(sessions).toHaveLength(2);
    expect(sessions[0]?.localState).toMatchObject({
      closeReason: "idle_timeout",
      boundaryConfidence: 0.95
    });
  });

  it("splits after protected-context gaps and counts protected skips", () => {
    const sessions = buildActivitySessions(
      [
        observation("protected_1", "2026-05-21T12:00:00.000Z", {
          topic: "orbit-security",
          summary: "Review Orbit protected app suppression audit."
        }),
        protectedObservation("protected_skip", "2026-05-21T12:02:00.000Z"),
        observation("protected_2", "2026-05-21T12:06:00.000Z", {
          topic: "orbit-security",
          summary: "Resume Orbit security review after protected app was skipped."
        })
      ],
      { now: new Date("2026-05-21T12:30:00.000Z") }
    );

    expect(sessions).toHaveLength(2);
    expect(sessions[0]?.localState).toMatchObject({
      closeReason: "protected_app_gap",
      protectedSkipCount: 1,
      boundaryConfidence: 0.95
    });
    expect(sessions[0]?.localState.qualitySignals).toMatchObject({
      protectedSkipCount: 1
    });
  });

  it("uses OCR topic similarity to split within the same app", () => {
    const sessions = buildActivitySessions(
      [
        observation("topic_1", "2026-05-21T13:00:00.000Z", {
          app: "Chrome",
          windowTitle: "Orbit docs",
          type: "ocr_text",
          sourceKind: "ocr",
          topic: "orbit-retention",
          summary: "Orbit raw frame retention TTL, sidecar cleanup, and evidence playback."
        }),
        observation("topic_2", "2026-05-21T13:04:00.000Z", {
          app: "Chrome",
          windowTitle: "Trip booking",
          type: "ocr_text",
          sourceKind: "ocr",
          topic: "travel-booking",
          summary: "Flight booking options, seat selection, baggage fees, and hotel dates."
        })
      ],
      { now: new Date("2026-05-21T13:25:00.000Z") }
    );

    expect(sessions).toHaveLength(2);
    expect(sessions[0]?.topic).toBe("orbit-retention");
    expect(sessions[0]?.localState.closeReason).toBe("topic_shift");
    expect(sessions[1]?.topic).toBe("travel-booking");
  });

  it("merges a brief off-topic app hop back into the surrounding work session", () => {
    const sessions = buildActivitySessions(
      [
        observation("merge_1", "2026-05-21T14:00:00.000Z", {
          app: "Cursor",
          topic: "orbit-sessionizer",
          summary: "Implement Orbit sessionizer topic similarity and quality metrics."
        }),
        observation("merge_2", "2026-05-21T14:02:00.000Z", {
          app: "Slack",
          topic: "team-chat",
          summary: "Quick Slack reply about lunch logistics."
        }),
        observation("merge_3", "2026-05-21T14:03:00.000Z", {
          app: "Cursor",
          topic: "orbit-sessionizer",
          summary: "Return to Orbit sessionizer implementation and acceptance tests."
        }),
        observation("merge_4", "2026-05-21T14:05:00.000Z", {
          app: "Terminal",
          topic: "orbit-sessionizer",
          summary: "Run Orbit sessionizer tests."
        })
      ],
      { now: new Date("2026-05-21T14:06:00.000Z") }
    );

    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.topic).toBe("orbit-sessionizer");
    expect(sessions[0]?.localState.primaryApps).toEqual(["Cursor", "Slack", "Terminal"]);
    expect(sessions[0]?.localState.qualitySignals).toMatchObject({
      eventCount: 4,
      appCount: 3
    });
  });

  it("splits long continuous work at max duration with an explainable close reason", () => {
    const events = Array.from({ length: 7 }, (_, index) =>
      observation(`max_${index}`, new Date(Date.UTC(2026, 4, 21, 15, index * 15)).toISOString(), {
        app: index % 2 === 0 ? "Cursor" : "Terminal",
        topic: "orbit-long-coding",
        summary: `Orbit long coding checkpoint ${index} keeps the same implementation topic.`
      })
    );

    const sessions = buildActivitySessions(events, {
      now: new Date("2026-05-21T16:45:00.000Z"),
      maxSessionDurationMs: 60 * 60 * 1000
    });

    expect(sessions).toHaveLength(2);
    expect(sessions[0]?.durationSeconds).toBe(45 * 60);
    expect(sessions[0]?.localState).toMatchObject({
      closeReason: "max_duration",
      boundaryConfidence: 0.9
    });
    expect(sessions[1]?.topic).toBe("orbit-long-coding");
  });
});

function observation(
  id: string,
  occurredAt: string,
  overrides: {
    app?: string;
    windowTitle?: string;
    type?: EventType;
    sourceKind?: SourceKind;
    topic?: string;
    summary?: string;
    frameHash?: string;
    rawAvailable?: boolean;
  } = {}
): Event {
  const type = overrides.type ?? "screen_observation";
  const sourceKind = overrides.sourceKind ?? (type === "ocr_text" ? "ocr" : "screen");
  const topic = overrides.topic ?? "orbit-sessionizer";
  const frameHash = overrides.frameHash ?? `${id}_frame`;
  const metadata: Record<string, unknown> = {};
  if (type === "screen_observation") {
    metadata.frameHash = frameHash;
    metadata.rawFrameState = overrides.rawAvailable ? "available" : "not_stored";
    metadata.rawFrameSizeBytes = overrides.rawAvailable ? 42_000 : 0;
  }
  if (type === "ocr_text") {
    metadata.sourceFrameHash = frameHash;
    metadata.lineCount = 3;
    metadata.snippetCount = 1;
  }
  return {
    id: `event_${id}`,
    schemaVersion: 1,
    source: {
      kind: sourceKind,
      adapterId: `adapter_${sourceKind}`,
      externalId: id,
      pointer: `${sourceKind}://fixture/yansu-sessionizer#${id}`
    },
    occurredAt,
    observedAt: occurredAt,
    context: {
      app: overrides.app ?? "Cursor",
      windowTitle: overrides.windowTitle ?? `${overrides.app ?? "Cursor"} ${topic}`,
      project: "orbit",
      threadId: "yansu-sessionizer"
    },
    type,
    content: {
      title: `${topic} evidence`,
      summary: overrides.summary ?? `${topic} evidence for Orbit activity sessionization.`,
      metadata
    },
    classification: {
      topics: [topic],
      entities: [],
      confidence: 0.86
    },
    privacy: {
      sensitivity: "confidential",
      retentionPolicyId: "perception_summary_only",
      redactionState: "none"
    },
    hash: `hash_${id}`
  };
}

function protectedObservation(id: string, occurredAt: string): Event {
  return {
    ...observation(id, occurredAt, {
      app: "1Password",
      sourceKind: "desktop",
      type: "app_focus",
      topic: "protected-context",
      summary: "Protected app was skipped before capture."
    }),
    privacy: {
      sensitivity: "internal",
      retentionPolicyId: "observation_default",
      redactionState: "redacted"
    },
    content: {
      title: "Focused protected app 1Password",
      summary: "Protected app was skipped before capture."
    }
  };
}
