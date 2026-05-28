import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("HandoffPage", () => {
  it("renders handoff generation, preview, copy, safety, evidence, and error states", () => {
    const source = readFileSync(new URL("./HandoffPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("handoff.generate");
    expect(source).toContain("handoff.projectName");
    expect(source).toContain("buildProjectOptions");
    expect(source).toContain("handoff-project-options");
    expect(source).toContain("handoff.noProjectOptions");
    expect(source).toContain("handoff.preview");
    expect(source).toContain("handoff.copyPreview");
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

  it("copies the currently selected Markdown or JSON preview format", () => {
    const source = readFileSync(new URL("./HandoffPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("copyPreview");
    expect(source).toContain("previewFormat === \"JSON\"");
    expect(source).toContain("JSON.stringify(result.handoff, null, 2)");
    expect(source).toContain("selectPreviewFormat");
    expect(source).toContain("setCopiedFormat(undefined)");
    expect(source).toContain("handoff.copyPreview");
    expect(source).toContain("handoff.copiedJson");
    expect(source).toContain("handoff.copiedMarkdown");
    expect(source).toContain("handoff.previewCopyBoundary");
  });

  it("can render a handoff result passed from Today without requiring a second generate click", () => {
    const source = readFileSync(new URL("./HandoffPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("initialResult");
    expect(source).toContain("useEffect");
    expect(source).toContain("setResult(initialResult)");
    expect(source).toContain("handoff.generatedFromToday");
  });

  it("can trace handoff evidence back to source Activity, Knowledge, and Recommendations", () => {
    const source = readFileSync(new URL("./HandoffPage.tsx", import.meta.url), "utf8");
    const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");

    expect(source).toContain("onOpenActivitySession");
    expect(source).toContain("onOpenKnowledgeArtifact");
    expect(source).toContain("onOpenRecommendation");
    expect(source).toContain("HandoffEvidenceCard");
    expect(source).toContain("handoff.evidenceSourceObject");
    expect(source).toContain("evidence.objectType");
    expect(source).toContain("evidence.objectId");
    expect(source).toContain('data-handoff-action="open-evidence-activity"');
    expect(source).toContain('data-handoff-action="open-evidence-knowledge"');
    expect(source).toContain('data-handoff-action="open-evidence-recommendation"');
    expect(app).toContain("onOpenActivitySession={actions.focusActivitySession}");
    expect(app).toContain("onOpenKnowledgeArtifact={actions.focusKnowledge}");
    expect(app).toContain("onOpenRecommendation={actions.focusRecommendation}");
  });

  it("turns excluded handoff items into review actions when the object has a local workbench", () => {
    const source = readFileSync(new URL("./HandoffPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("HandoffExcludedCard");
    expect(source).toContain("renderHandoffExclusionAction");
    expect(source).toContain('data-handoff-action="review-excluded-knowledge"');
    expect(source).toContain('data-handoff-action="review-excluded-memory"');
    expect(source).toContain('data-handoff-action="review-excluded-recommendation"');
    expect(source).toContain("handoff.reviewExcludedKnowledge");
    expect(source).toContain("handoff.reviewExcludedMemory");
    expect(source).toContain("handoff.reviewExcludedRecommendation");
  });

  it("turns included handoff objects into reviewable local workbench actions", () => {
    const source = readFileSync(new URL("./HandoffPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("HandoffIncludedSection");
    expect(source).toContain("HandoffIncludedActivityCard");
    expect(source).toContain("HandoffIncludedKnowledgeCard");
    expect(source).toContain("HandoffIncludedMemoryCard");
    expect(source).toContain("HandoffIncludedRecommendationCard");
    expect(source).toContain("pack.recentActivity");
    expect(source).toContain("pack.confirmedKnowledge");
    expect(source).toContain("pack.activeMemories");
    expect(source).toContain("pack.recommendedNextActions");
    expect(source).toContain('data-handoff-action="open-included-activity"');
    expect(source).toContain('data-handoff-action="open-included-knowledge"');
    expect(source).toContain('data-handoff-action="open-included-memory"');
    expect(source).toContain('data-handoff-action="open-included-recommendation"');
    expect(source).toContain("handoff.included");
    expect(source).toContain("handoff.includedRecentActivity");
    expect(source).toContain("handoff.includedConfirmedKnowledge");
    expect(source).toContain("handoff.includedActiveMemory");
    expect(source).toContain("handoff.includedRecommendations");
    expect(source).toContain("handoff.openIncludedActivity");
    expect(source).toContain("handoff.openIncludedKnowledge");
    expect(source).toContain("handoff.openIncludedMemory");
    expect(source).toContain("handoff.openIncludedRecommendation");
  });

  it("surfaces handoff decisions and risks with local source actions", () => {
    const source = readFileSync(new URL("./HandoffPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("HandoffDecisionRiskSection");
    expect(source).toContain("HandoffDecisionCard");
    expect(source).toContain("HandoffRiskCard");
    expect(source).toContain("pack.decisions");
    expect(source).toContain("pack.blockersAndRisks");
    expect(source).toContain("renderHandoffSourceAction");
    expect(source).toContain('data-handoff-action="open-decision-knowledge"');
    expect(source).toContain('data-handoff-action="open-decision-memory"');
    expect(source).toContain('data-handoff-action="open-risk-knowledge"');
    expect(source).toContain('data-handoff-action="open-risk-recommendation"');
    expect(source).toContain("handoff.decisions");
    expect(source).toContain("handoff.blockersAndRisks");
    expect(source).toContain("handoff.openDecisionKnowledge");
    expect(source).toContain("handoff.openDecisionMemory");
    expect(source).toContain("handoff.openRiskKnowledge");
    expect(source).toContain("handoff.openRiskRecommendation");
  });

  it("surfaces the generated handoff scope before Markdown and JSON previews", () => {
    const source = readFileSync(new URL("./HandoffPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("HandoffGeneratedScopeSummary");
    expect(source).toContain("buildHandoffScopeSummary");
    expect(source).toContain("handoff.generatedScope");
    expect(source).toContain("handoff.scopeKind");
    expect(source).toContain("handoff.scopeValue");
    expect(source).toContain("handoff.generatedAt");
    expect(source).toContain("handoff.scopeIncluded");
    expect(source).toContain("handoff.scopeExcluded");
    expect(source).toContain("handoff.scopeEvidence");
    expect(source).toContain("handoff.scopeAgentSafeBoundary");
    expect(source).toContain("pack.kind === \"project\"");
    expect(source).toContain("pack.date ??");
  });
});
