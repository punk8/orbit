import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("SourcesPage source governance controls", () => {
  it("renders source reconfiguration, cursor reset, deletion, and cleanup controls", () => {
    const source = readFileSync(new URL("./SourcesPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("action.reconfigure");
    expect(source).toContain("action.resetCursor");
    expect(source).toContain("action.deleteSource");
    expect(source).toContain("action.cleanupLegacyPrivacy");
    expect(source).toContain("source.cursorPresent");
    expect(source).toContain("source.cursorEmpty");
  });
});
