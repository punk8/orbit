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

  it("can jump from a Today activity card to the matching Activity evidence session", () => {
    const source = readFileSync(new URL("./TodayPage.tsx", import.meta.url), "utf8");
    const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
    const activity = readFileSync(new URL("./ActivityPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("onOpenActivitySession");
    expect(source).toContain("today.openActivityEvidence");
    expect(source).toContain("data-today-action=\"open-activity-evidence\"");
    expect(app).toContain("focusActivitySession");
    expect(app).toContain("reason: \"today_activity\"");
    expect(activity).toContain("activity.latestTodayFocused");
  });

  it("can open a Today Knowledge draft directly in the Knowledge review workbench", () => {
    const source = readFileSync(new URL("./TodayPage.tsx", import.meta.url), "utf8");
    const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
    const knowledge = readFileSync(new URL("./KnowledgePage.tsx", import.meta.url), "utf8");

    expect(source).toContain("onOpenKnowledgeArtifact");
    expect(source).toContain("today.reviewKnowledgeDraft");
    expect(source).toContain("data-today-action=\"review-knowledge-draft\"");
    expect(app).toContain("focusKnowledge");
    expect(app).toContain("onOpenKnowledgeArtifact={actions.focusKnowledge}");
    expect(knowledge).toContain("focusArtifactId");
  });

  it("can open a Today Recommendation directly in the recommendation action workbench", () => {
    const source = readFileSync(new URL("./TodayPage.tsx", import.meta.url), "utf8");
    const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
    const recommendations = readFileSync(new URL("./RecommendationsPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("onOpenRecommendation");
    expect(source).toContain("today.handleRecommendation");
    expect(source).toContain("data-today-action=\"handle-recommendation\"");
    expect(app).toContain("focusRecommendation");
    expect(app).toContain("onOpenRecommendation={actions.focusRecommendation}");
    expect(recommendations).toContain("focusRecommendationId");
    expect(recommendations).toContain("recommendation.latestTodayFocused");
  });
});
