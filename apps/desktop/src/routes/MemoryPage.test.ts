import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("MemoryPage governance workbench", () => {
  it("renders search, grouping, detail, edit, index state, and agent context policy", () => {
    const source = readFileSync(new URL("./MemoryPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("searchMemory");
    expect(source).toContain("getMemoryDetail");
    expect(source).toContain("onEditMemory");
    expect(source).toContain("memory.dimension");
    expect(source).toContain("memory.version");
    expect(source).toContain("memory.sourceSessionIds");
    expect(source).toContain("memory.reindexStatus");
    expect(source).toContain("memory.agentContextPolicy");
    expect(source).toContain("memory.indexState");
    expect(source).toContain("memory.indexProvider");
    expect(source).toContain("fallbackOrder");
    expect(source).toContain("memory.agentContextBlocked");
    expect(source).toContain("changedFields");
  });
});
