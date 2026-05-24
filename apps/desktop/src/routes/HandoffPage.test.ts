import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("HandoffPage", () => {
  it("renders handoff generation, preview, copy, safety, evidence, and error states", () => {
    const source = readFileSync(new URL("./HandoffPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("handoff.generate");
    expect(source).toContain("handoff.projectName");
    expect(source).toContain("handoff.preview");
    expect(source).toContain("handoff.copyMarkdown");
    expect(source).toContain("handoff.safetyBoundaries");
    expect(source).toContain("handoff.evidence");
    expect(source).toContain("handoff.excluded");
    expect(source).toContain("handoffExclusionReasonLabel");
    expect(source).toContain("handoffExclusionDescription");
    expect(source).toContain("handoff.exclusion.reason");
    expect(source).toContain("handoffExclusionNextAction");
    expect(source).toContain("handoff.exclusion.nextAction");
    expect(source).toContain("handoff.currentState");
    expect(source).toContain("handoff.completedOrAttempted");
    expect(source).toContain("handoff.nextSteps");
    expect(source).toContain("handoff.safeToExport");
    expect(source).toContain("handoff.excludedByPolicy");
    expect(source).toContain("handoff.preflightTotalRecentActivity");
    expect(source).toContain("HandoffSafetySummary");
    expect(source).toContain("buildHandoffMetrics");
    expect(source).toContain("handoff.empty");
    expect(source).toContain("handoff.error");
    expect(source).toContain("navigator.clipboard.writeText");
  });
});
