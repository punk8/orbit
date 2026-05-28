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
    expect(source).toContain("review.openMemory");
    expect(source).toContain("onOpenMemory");
    expect(source).toContain("onOpenActivitySession");
    expect(source).toContain("review.openSourceActivity");
    expect(source).toContain("artifact.metadata.sourceSessionIds[0]");
    expect(source).toContain("memory.sourceSessionIds[0]");
    expect(source).toContain("data-review-action=\"open-source-activity\"");
    expect(source).toContain("data-review-action=\"open-memory-source-activity\"");
    expect(source).toContain("data-review-action=\"open-memory\"");
    expect(app).toContain("onOpenActivitySession={actions.focusActivitySession}");
    expect(app).toContain("onOpenMemory={actions.focusMemory}");
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
    expect(source).toContain("review.markdownPreview");
    expect(source).toContain("artifact.content.markdown");
    expect(source).toContain("review-queue-markdown-preview");
    expect(source).toContain("review.memoryGovernancePreview");
    expect(source).toContain("review.memoryAgentContextBlocked");
    expect(source).toContain("review-memory-governance-preview");
    expect(source).toContain("formatReviewMemoryScope");
    expect(source).toContain("formatReviewMemorySources");
    expect(source).toContain("memoryKind(memory.kind)");
    expect(source).toContain("memory.status === \"confirmed\"");
  });

  it("shows self-serve next steps when the review queue is empty", () => {
    const source = readFileSync(new URL("./ReviewQueuePage.tsx", import.meta.url), "utf8");
    const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
    const i18n = readFileSync(new URL("../i18n.tsx", import.meta.url), "utf8");

    expect(source).toContain("reviewQueueEmpty");
    expect(source).toContain("review-empty-workflow");
    expect(source).toContain("review.empty.title");
    expect(source).toContain("review.empty.addSource");
    expect(source).toContain("review.empty.openActivity");
    expect(source).toContain("review.empty.openHandoff");
    expect(source).toContain("onNavigate");
    expect(source).toContain("onNavigate(\"sources\")");
    expect(source).toContain("onNavigate(\"activity\")");
    expect(source).toContain("onNavigate(\"handoff\")");
    expect(app).toContain("onNavigate={actions.navigate}");
    expect(i18n).toContain("review.empty.noExternalActions");
  });
});
