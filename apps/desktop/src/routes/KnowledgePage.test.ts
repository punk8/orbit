import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("KnowledgePage review workbench", () => {
  it("renders search, detail, copy, edit, review, provider, and evidence controls", () => {
    const source = readFileSync(new URL("./KnowledgePage.tsx", import.meta.url), "utf8");

    expect(source).toContain("searchKnowledge");
    expect(source).toContain("getKnowledgeArtifactDetail");
    expect(source).toContain("onEditKnowledge");
    expect(source).toContain("navigator.clipboard.writeText");
    expect(source).toContain("knowledge.providerMetadata");
    expect(source).toContain("knowledge.openQuestions");
    expect(source).toContain("knowledge.evidenceAvailability");
    expect(source).toContain("action.regenerate");
    expect(source).toContain("action.translate");
    expect(source).toContain("action.delete");
    expect(source).toContain("knowledge.evidencePreserved");
    expect(source).toContain("confirm.rejectKnowledge");
    expect(source).toContain("lastReviewAction");
    expect(source).toContain("setLastReviewAction");
    expect(source).toContain('data-knowledge-feedback="last-action"');
    expect(source).toContain("review.lastActionPrefix");
    expect(source).toContain("knowledge.reviewActionRecorded");
    expect(source).toContain("changedFields");
  });

  it("keeps edit fields, Markdown preview, evidence, and focus navigation in one workbench", () => {
    const source = readFileSync(new URL("./KnowledgePage.tsx", import.meta.url), "utf8");
    const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");

    expect(source).toContain("focusArtifactId");
    expect(source).toContain("onFocusConsumed");
    expect(source).toContain("onOpenActivitySession");
    expect(source).toContain("data-knowledge-action=\"open-source-session\"");
    expect(source).toContain("knowledge.openSourceSession");
    expect(app).toContain("onOpenActivitySession={actions.focusActivitySession}");
    expect(source).toContain("knowledge-edit-workbench");
    expect(source).toContain("knowledge.editingMarkdownPreview");
    expect(source).toContain("EvidenceList evidence={artifact.evidence}");
  });
});
