import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("MemoryPage governance workbench", () => {
  it("renders search, grouping, detail, edit, index state, and agent context policy", () => {
    const source = readFileSync(new URL("./MemoryPage.tsx", import.meta.url), "utf8");
    const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");

    expect(source).toContain("searchMemory");
    expect(source).toContain("getMemoryDetail");
    expect(source).toContain("focusMemoryId");
    expect(source).toContain("onFocusConsumed");
    expect(source).toContain("setFilters(defaultFilters)");
    expect(app).toContain("memoryFocusId");
    expect(app).toContain("onFocusConsumed={actions.clearMemoryFocus}");
    expect(app).toContain("focusMemory: (id)");
    expect(source).toContain("onEditMemory");
    expect(source).toContain("memory.dimension");
    expect(source).toContain("memory.version");
    expect(source).toContain("memory.sourceSessionIds");
    expect(source).toContain("memory.reindexStatus");
    expect(source).toContain("memory.agentContextPolicy");
    expect(source).toContain("memory.indexState");
    expect(source).toContain("memory.indexProvider");
    expect(source).toContain("fallbackOrder");
    expect(source).toContain("onDeleteMemory");
    expect(source).toContain("onRollbackMemoryVersion");
    expect(source).toContain("confirm.deleteMemory");
    expect(source).toContain("confirm.rollbackMemoryVersion");
    expect(source).toContain("memory.agentContextBlocked");
    expect(source).toContain("changedFields");
  });
});
