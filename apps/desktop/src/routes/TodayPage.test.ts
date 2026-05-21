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
});
