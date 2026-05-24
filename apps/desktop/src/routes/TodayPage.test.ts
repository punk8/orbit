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
});
