import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ReviewQueuePage review workflow", () => {
  it("shows evidence, metrics, open actions, and local action feedback", () => {
    const source = readFileSync(new URL("./ReviewQueuePage.tsx", import.meta.url), "utf8");
    const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");

    expect(source).toContain("expandedEvidenceIds");
    expect(source).toContain("EvidenceList");
    expect(source).toContain("review.showEvidence");
    expect(source).toContain("review.hideEvidence");
    expect(source).toContain("review.openKnowledge");
    expect(source).toContain("onOpenActivitySession");
    expect(source).toContain("review.openSourceActivity");
    expect(source).toContain("artifact.metadata.sourceSessionIds[0]");
    expect(source).toContain("data-review-action=\"open-source-activity\"");
    expect(app).toContain("onOpenActivitySession={actions.focusActivitySession}");
    expect(source).toContain("formatConfidence");
    expect(source).toContain("inferEvidenceSensitivity");
    expect(source).toContain("metadata.sourceSessionIds.length");
    expect(source).toContain("lastAction");
    expect(source).toContain("ReviewQueueLastAction");
    expect(source).toContain("review.lastActionPrefix");
    expect(source).toContain("review.pendingKnowledgeCount");
    expect(source).toContain("review.pendingMemoryCount");
    expect(source).toContain("data-review-feedback=\"last-action\"");
    expect(source).toContain("withoutExpandedEvidence");
  });
});
