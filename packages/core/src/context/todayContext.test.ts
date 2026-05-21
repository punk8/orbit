import { describe, expect, it } from "vitest";
import type { ActivitySession, Event } from "../index";
import { buildTodayContext, getLocalDateKey, isInLocalDate } from "./todayContext";

describe("today context date helpers", () => {
  it("formats local date keys without UTC rollover", () => {
    expect(getLocalDateKey(new Date(2026, 4, 21, 1, 30))).toBe("2026-05-21");
  });

  it("matches ISO timestamps against the user's local day", () => {
    const localMorning = new Date(2026, 4, 21, 9, 0).toISOString();
    const nextDay = new Date(2026, 4, 22, 0, 30).toISOString();

    expect(isInLocalDate("2026-05-21", localMorning)).toBe(true);
    expect(isInLocalDate("2026-05-21", nextDay)).toBe(false);
  });

  it("removes failed-redaction evidence from Today activity context", () => {
    const today = buildTodayContext({
      date: "2026-05-21",
      activitySessions: [makeActivity()],
      knowledgeArtifacts: [],
      memories: [],
      recommendations: [],
      events: [makeEvent("evt_safe", "none"), makeEvent("evt_failed", "failed")]
    });

    expect(today.activitySessions[0]?.eventIds).toEqual(["evt_safe"]);
    expect(today.activitySessions[0]?.evidence.map((ref) => ref.eventId)).toEqual(["evt_safe"]);
  });
});

function makeActivity(): ActivitySession {
  return {
    id: "activity_1",
    schemaVersion: 1,
    title: "Perception activity",
    startAt: "2026-05-21T09:00:00.000Z",
    endAt: "2026-05-21T09:05:00.000Z",
    durationSeconds: 300,
    sourceKinds: ["audio"],
    apps: ["Zoom"],
    eventCount: 2,
    eventIds: ["evt_safe", "evt_failed"],
    evidence: [
      {
        eventId: "evt_safe",
        sourceKind: "audio",
        sourcePointer: "audio://safe",
        timestamp: "2026-05-21T09:00:00.000Z"
      },
      {
        eventId: "evt_failed",
        sourceKind: "audio",
        sourcePointer: "audio://failed",
        timestamp: "2026-05-21T09:01:00.000Z"
      }
    ],
    localState: { rawAvailable: false, indexed: true },
    privacy: { sensitivity: "confidential", retentionPolicyId: "default" },
    createdAt: "2026-05-21T09:00:00.000Z",
    updatedAt: "2026-05-21T09:05:00.000Z"
  };
}

function makeEvent(id: string, redactionState: Event["privacy"]["redactionState"]): Event {
  return {
    id,
    schemaVersion: 1,
    source: {
      kind: "audio",
      adapterId: "perception_audio",
      pointer: `audio://${id}`
    },
    occurredAt: "2026-05-21T09:00:00.000Z",
    observedAt: "2026-05-21T09:00:00.000Z",
    context: { app: "Zoom" },
    type: "audio_segment",
    content: { summary: id },
    privacy: {
      sensitivity: "confidential",
      retentionPolicyId: "perception_summary_only",
      redactionState
    },
    hash: id
  };
}
