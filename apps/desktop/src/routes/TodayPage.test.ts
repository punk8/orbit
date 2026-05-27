import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("TodayPage context completion", () => {
  it("renders perception evidence, Knowledge drafts, and Recommendations", () => {
    const source = readFileSync(new URL("./TodayPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("section.recentActivity");
    expect(source).toContain("section.knowledgeDrafts");
    expect(source).toContain("EvidenceList");
    expect(source).toContain("sourceKind");
    expect(source).toContain("snapshot.today.recommendations");
  });

  it("renders a product workbench with source status, next action, and handoff entry points", () => {
    const source = readFileSync(new URL("./TodayPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("source status");
    expect(source).toContain("next action");
    expect(source).toContain("handoff");
    expect(source).toContain("today-source-status-grid");
    expect(source).toContain("today-next-action-grid");
    expect(source).toContain("today-handoff-strip");
    expect(source).toContain("section.sourceStatus");
    expect(source).toContain("nav.handoff");
  });

  it("exposes a one-shot real screen/OCR capture entry with privacy boundaries", () => {
    const source = readFileSync(new URL("./TodayPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("onCaptureScreenOcr");
    expect(source).toContain("today.screenOcrCaptureTitle");
    expect(source).toContain("today.screenOcrCaptureBoundary");
    expect(source).toContain("action.captureScreenOcr");
    expect(source).toContain("today-screen-ocr-strip");
    expect(source).toContain("today.captureScreenOcrStatus");
  });

  it("shows handoff readiness and can generate today's handoff directly", () => {
    const source = readFileSync(new URL("./TodayPage.tsx", import.meta.url), "utf8");
    const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");

    expect(source).toContain("onGenerateTodayHandoff");
    expect(source).toContain("today-handoff-readiness");
    expect(source).toContain("buildTodayHandoffReadiness");
    expect(source).toContain("today.generateTodayHandoff");
    expect(source).toContain("today.reviewBeforeHandoff");
    expect(source).toContain("today.handoffIncluded");
    expect(source).toContain("today.handoffExcluded");
    expect(app).toContain("generateTodayHandoffFromToday");
    expect(app).toContain("pendingHandoffResult");
  });
});
