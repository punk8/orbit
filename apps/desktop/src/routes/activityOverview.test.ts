import { describe, expect, it } from "vitest";
import type { ActivitySession } from "@orbit/core";
import { buildActivityOverview } from "./activityOverview";

describe("buildActivityOverview", () => {
  it("summarizes daily activity evidence and work state", () => {
    const overview = buildActivityOverview(makeSessions(), "day", "2026-05-21");

    expect(overview.range).toBe("day");
    expect(overview.label).toBe("2026-05-21");
    expect(overview.activeSeconds).toBe(55 * 60);
    expect(overview.sessionCount).toBe(3);
    expect(overview.appCount).toBe(4);
    expect(overview.peakHourLabel).toBe(localHourLabel("2026-05-21T09:00:00.000Z"));
    expect(overview.frameCount).toBe(8);
    expect(overview.ocrPageCount).toBe(5);
    expect(overview.ocrTextChars).toBe(960);
    expect(overview.protectedSkipCount).toBe(2);
    expect(overview.rawAvailableCount).toBe(1);
    expect(overview.topApps.slice(0, 3)).toEqual([
      { label: "Cursor", count: 2, sessionIds: ["activity_a", "activity_b"] },
      { label: "Terminal", count: 1, sessionIds: ["activity_a"] },
      { label: "Slack", count: 1, sessionIds: ["activity_b"] }
    ]);
    expect(overview.topApps).toContainEqual({
      label: "Mail",
      count: 1,
      sessionIds: ["activity_c"]
    });
    expect(overview.topicClusters[0]).toMatchObject({
      label: "orbit-sessionizer",
      count: 2,
      sessionIds: ["activity_a", "activity_b"]
    });
    expect(overview.done).toEqual([
      expect.objectContaining({
        sessionId: "activity_a",
        text: "Done: implemented playback scrubber."
      })
    ]);
    expect(overview.decisions).toEqual([
      expect.objectContaining({
        sessionId: "activity_b",
        text: "Decision: keep raw screenshots local."
      })
    ]);
    expect(overview.open).toEqual([
      expect.objectContaining({
        sessionId: "activity_b",
        text: "Open: verify desktop e2e."
      })
    ]);
    expect(overview.next).toEqual([
      expect.objectContaining({
        sessionId: "activity_b",
        text: "Next: run package smoke."
      })
    ]);
    expect(overview.lowQualityWarnings).toEqual([
      expect.objectContaining({
        sessionId: "activity_c",
        title: "orbit: admin",
        reason: "below_quality_threshold"
      })
    ]);
  });

  it("summarizes weekly activity and links items back to sessions", () => {
    const overview = buildActivityOverview(makeSessions(), "week", "2026-W21");

    expect(overview.range).toBe("week");
    expect(overview.label).toBe("2026-W21");
    expect(overview.sessionLinks.map((link) => link.id)).toEqual([
      "activity_a",
      "activity_b",
      "activity_c",
      "activity_d"
    ]);
    expect(overview.activeSeconds).toBe(85 * 60);
    expect(overview.frameCount).toBe(12);
    expect(overview.ocrPageCount).toBe(7);
    expect(overview.topicClusters.some((cluster) => cluster.label === "weekly-review")).toBe(true);
  });
});

function localHourLabel(value: string): string {
  const date = new Date(value);
  return `${date.getHours().toString().padStart(2, "0")}:00`;
}

function makeSessions(): ActivitySession[] {
  return [
    session("activity_a", {
      startAt: "2026-05-21T09:00:00.000Z",
      endAt: "2026-05-21T09:40:00.000Z",
      title: "orbit: sessionizer",
      topic: "orbit-sessionizer",
      apps: ["Cursor", "Terminal"],
      summary: "Done: implemented playback scrubber.",
      frameCount: 6,
      ocrPageCount: 4,
      ocrTextChars: 720,
      rawAvailable: true
    }),
    session("activity_b", {
      startAt: "2026-05-21T09:45:00.000Z",
      endAt: "2026-05-21T10:00:00.000Z",
      title: "orbit: privacy",
      topic: "orbit-sessionizer",
      apps: ["Cursor", "Slack"],
      summary:
        "Decision: keep raw screenshots local. Open: verify desktop e2e. Next: run package smoke.",
      frameCount: 2,
      ocrPageCount: 1,
      ocrTextChars: 240,
      protectedSkipCount: 2
    }),
    session("activity_c", {
      startAt: "2026-05-21T14:00:00.000Z",
      endAt: "2026-05-21T14:00:00.000Z",
      title: "orbit: admin",
      topic: "admin",
      apps: ["Mail"],
      summary: "Short admin check.",
      lowQualityReason: "below_quality_threshold"
    }),
    session("activity_d", {
      startAt: "2026-05-22T11:00:00.000Z",
      endAt: "2026-05-22T11:30:00.000Z",
      title: "orbit: weekly",
      topic: "weekly-review",
      apps: ["Cursor"],
      summary: "Done: weekly review draft.",
      frameCount: 4,
      ocrPageCount: 2,
      ocrTextChars: 300
    })
  ];
}

function session(
  id: string,
  overrides: {
    startAt: string;
    endAt: string;
    title: string;
    topic: string;
    apps: string[];
    summary: string;
    frameCount?: number;
    ocrPageCount?: number;
    ocrTextChars?: number;
    protectedSkipCount?: number;
    rawAvailable?: boolean;
    lowQualityReason?: string;
  }
): ActivitySession {
  return {
    id,
    schemaVersion: 1,
    title: overrides.title,
    startAt: overrides.startAt,
    endAt: overrides.endAt,
    durationSeconds: Math.max(
      0,
      Math.round((new Date(overrides.endAt).getTime() - new Date(overrides.startAt).getTime()) / 1000)
    ),
    sourceKinds: ["screen", "ocr"],
    apps: overrides.apps,
    eventCount: 4,
    eventIds: [`${id}_event`],
    topic: overrides.topic,
    project: "orbit",
    summary: overrides.summary,
    evidence: [
      {
        activitySessionId: id,
        sourceKind: "screen",
        sourcePointer: `screen://fixture/${id}`,
        timestamp: overrides.startAt,
        excerpt: overrides.summary
      }
    ],
    localState: {
      rawAvailable: overrides.rawAvailable ?? false,
      indexed: true,
      closed: true,
      frameCount: overrides.frameCount ?? 0,
      ocrPageCount: overrides.ocrPageCount ?? 0,
      ocrTextChars: overrides.ocrTextChars ?? 0,
      eventCount: 4,
      protectedSkipCount: overrides.protectedSkipCount ?? 0,
      qualitySignals: {
        durationSeconds: 0,
        frameCount: overrides.frameCount ?? 0,
        ocrPageCount: overrides.ocrPageCount ?? 0,
        ocrTextChars: overrides.ocrTextChars ?? 0,
        eventCount: 4,
        appCount: overrides.apps.length,
        sourceCount: 2,
        protectedSkipCount: overrides.protectedSkipCount ?? 0,
        rawAvailable: overrides.rawAvailable ?? false,
        hasFollowUpOrRisk: false,
        redactionSafe: true,
        isLowQuality: Boolean(overrides.lowQualityReason),
        reasons: overrides.lowQualityReason ? [overrides.lowQualityReason] : []
      }
    },
    privacy: {
      sensitivity: "confidential",
      retentionPolicyId: "default"
    },
    createdAt: overrides.startAt,
    updatedAt: overrides.endAt
  };
}
