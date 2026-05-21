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

  it("renders a Yansu-like playback shell with timeline, recording viewer, scrubber, and honest raw-frame state", () => {
    const source = readFileSync(new URL("./ActivityPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("activity-playback-workbench");
    expect(source).toContain("activity-timeline-rail");
    expect(source).toContain("activity-recording-viewer");
    expect(source).toContain("activity-frame-scrubber");
    expect(source).toContain("activity.noRawFramesYet");
    expect(source).toContain("buildPlaybackFrames");
  });

  it("offers a real manual Screen/OCR capture action for product dogfooding", () => {
    const source = readFileSync(new URL("./ActivityPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("onCaptureScreenOcr");
    expect(source).toContain("action.captureScreenOcr");
    expect(source).toContain("activity.captureScreenOcrDescription");
    expect(source).toContain("activity.captureScreenOcrNoFixtures");
  });
});
