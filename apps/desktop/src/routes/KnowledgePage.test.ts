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
    expect(source).toContain("knowledge.evidencePreserved");
    expect(source).toContain("confirm.rejectKnowledge");
    expect(source).toContain("changedFields");
  });
});
