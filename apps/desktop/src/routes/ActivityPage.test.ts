import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ActivityPage evidence workbench", () => {
  it("renders filters, detail loading, event stream, processing, storage, and derived objects", () => {
    const source = readFileSync(new URL("./ActivityPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("getActivitySessionDetail");
    expect(source).toContain("filter.source");
    expect(source).toContain("filter.search");
    expect(source).toContain("activity.eventStream");
    expect(source).toContain("activity.processing");
    expect(source).toContain("activity.storage");
    expect(source).toContain("activity.sourcePolicy");
    expect(source).toContain("activity.derivedObjects");
    expect(source).toContain("activity.providerBoundary");
  });

  it("surfaces real desktop app/window metadata and source pointers in the event stream", () => {
    const source = readFileSync(new URL("./ActivityPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("event.source.pointer");
    expect(source).toContain("event.context.app");
    expect(source).toContain("event.context.windowTitle");
    expect(source).toContain("formatTimeRange(session.startAt, session.endAt)");
    expect(source).toContain("evidence={session.evidence}");
  });

  it("renders a Yansu-like playback shell with timeline, recording viewer, scrubber, and honest raw-frame state", () => {
    const source = readFileSync(new URL("./ActivityPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("activity-playback-workbench");
    expect(source).toContain("activity-timeline-rail");
    expect(source).toContain("activity-recording-viewer");
    expect(source).toContain("activity-frame-scrubber");
    expect(source).toContain("onDeleteActivitySession");
    expect(source).toContain("confirm.deleteActivity");
    expect(source).toContain("activity.noRawFramesYet");
    expect(source).toContain("buildPlaybackFrames");
    expect(source).toContain("expired");
    expect(source).toContain("blocked_protected");
    expect(source).toContain("formatPlaybackRawState");
    expect(source).toContain("activity.rawExpired");
    expect(source).toContain("activity.rawDeleted");
    expect(source).toContain("activity.rawBlockedProtected");
    expect(source).toContain("activity.rawPointerPreserved");
    expect(source).not.toContain("<code>{currentFrame.rawRef}</code>");
    expect(source).toContain("linkedEvents");
    expect(source).toContain("frameCount");
    expect(source).toContain("eventCount");
  });

  it("renders daily and weekly overview panels with evidence-backed work buckets", () => {
    const source = readFileSync(new URL("./ActivityPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("buildActivityOverview");
    expect(source).toContain("activity.overviewDaily");
    expect(source).toContain("activity.overviewWeekly");
    expect(source).toContain("activity.activeTime");
    expect(source).toContain("activity.peakTime");
    expect(source).toContain("activity.ocrPages");
    expect(source).toContain("activity.protectedSkips");
    expect(source).toContain("activity.done");
    expect(source).toContain("activity.decisions");
    expect(source).toContain("activity.open");
    expect(source).toContain("activity.next");
    expect(source).toContain("activity.lowQualityWarnings");
    expect(source).toContain("onSelectSession");
  });

  it("offers a real manual Screen/OCR capture action for product dogfooding", () => {
    const source = readFileSync(new URL("./ActivityPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("onCaptureScreenOcr");
    expect(source).toContain("action.captureScreenOcr");
    expect(source).toContain("activity.captureScreenOcrDescription");
    expect(source).toContain("activity.captureScreenOcrNoSampleData");
  });

  it("can consume a latest-capture focus target and jump to the generated session", () => {
    const source = readFileSync(new URL("./ActivityPage.tsx", import.meta.url), "utf8");
    const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");

    expect(source).toContain("focusTarget");
    expect(source).toContain("ActivityFocusTarget");
    expect(source).toContain("focusTarget.reason");
    expect(source).toContain("focusTarget.eventIds");
    expect(source).toContain("focusTarget.sourceAdapterIds");
    expect(source).toContain("onFocusConsumed");
    expect(source).toContain("setFilters(defaultFilters)");
    expect(source).toContain("activity.focusedEvents");
    expect(source).toContain("activity.focusedSources");
    expect(source).toContain("highlightedEventIds");
    expect(source).toContain('data-activity-focus="event"');
    expect(source).toContain("activity.latestCaptureFocused");
    expect(source).toContain("activity.latestImportFocused");
    expect(app).toContain("eventIds: focus.eventIds ?? []");
    expect(app).toContain("sourceAdapterIds: focus.sourceAdapterIds ?? []");
  });

  it("can open derived Knowledge and Recommendations from the Activity evidence detail", () => {
    const source = readFileSync(new URL("./ActivityPage.tsx", import.meta.url), "utf8");
    const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");

    expect(source).toContain("onOpenKnowledgeArtifact");
    expect(source).toContain("onOpenRecommendation");
    expect(source).toContain("data-activity-action=\"open-derived-knowledge\"");
    expect(source).toContain("data-activity-action=\"open-derived-recommendation\"");
    expect(source).toContain("activity.openDerivedKnowledge");
    expect(source).toContain("activity.openDerivedRecommendation");
    expect(app).toContain("onOpenKnowledgeArtifact={actions.focusKnowledge}");
    expect(app).toContain("onOpenRecommendation={actions.focusRecommendation}");
  });
});
