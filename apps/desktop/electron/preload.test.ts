import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("desktop preload API", () => {
  it("exposes source governance actions", () => {
    const source = readFileSync(new URL("./preload.ts", import.meta.url), "utf8");

    expect(source).toContain("reconfigureSource");
    expect(source).toContain("deleteSource");
    expect(source).toContain("resetSourceCursor");
    expect(source).toContain("cleanupLegacyEventPrivacy");
    expect(source).toContain("generateHandoff");
  });
});
