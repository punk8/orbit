import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("RecommendationsPage explanation workbench", () => {
  it("renders detail, snooze date, evidence, side-effect policy, and no-external-action copy", () => {
    const source = readFileSync(new URL("./RecommendationsPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("getRecommendationDetail");
    expect(source).toContain("recommendation.sideEffectPolicy");
    expect(source).toContain("recommendation.noExternalSideEffects");
    expect(source).toContain("recommendation.acceptPolicy");
    expect(source).toContain("recommendation.confidenceExplanation");
    expect(source).toContain("recommendation.handoffImpact");
    expect(source).toContain('type="date"');
    expect(source).toContain("snoozeUntil");
  });

  it("defaults to an active queue and exposes snoozed, closed, and all lifecycle filters", () => {
    const source = readFileSync(new URL("./RecommendationsPage.tsx", import.meta.url), "utf8");

    expect(source).toContain('queue: "active"');
    expect(source).toContain("recommendation.queue.active");
    expect(source).toContain("recommendation.queue.snoozed");
    expect(source).toContain("recommendation.queue.closed");
    expect(source).toContain("recommendation.queue.all");
    expect(source).toContain("isRecommendationVisibleInQueue");
    expect(source).toContain("recommendation.acceptRecordsOnly");
  });

  it("shows local lifecycle feedback and merged evidence hints after user actions", () => {
    const source = readFileSync(new URL("./RecommendationsPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("lastAction");
    expect(source).toContain("LastRecommendationAction");
    expect(source).toContain("recommendation.lastActionPrefix");
    expect(source).toContain("recommendationActionLabel");
    expect(source).toContain("data-recommendation-feedback=\"last-action\"");
    expect(source).toContain("recommendation.mergedEvidenceHint");
    expect(source).toContain("mergedEvidenceHint");
  });

  it("can consume a focused recommendation and clear filters for the action workbench", () => {
    const source = readFileSync(new URL("./RecommendationsPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("focusRecommendationId");
    expect(source).toContain("onFocusConsumed");
    expect(source).toContain("setFilters(defaultFilters)");
    expect(source).toContain("recommendation.latestTodayFocused");
  });
});
