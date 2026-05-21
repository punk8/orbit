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
});
