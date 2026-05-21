import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("desktop main process runtime guards", () => {
  it("supports skipping login item writes in smoke tests", () => {
    const main = readFileSync(new URL("./main.ts", import.meta.url), "utf8");
    const smoke = readFileSync(new URL("../scripts/e2e-smoke.mjs", import.meta.url), "utf8");

    expect(main).toContain("ORBIT_SKIP_LOGIN_ITEM_SETTINGS");
    expect(main).toContain("ORBIT_E2E_RENDERER_SMOKE");
    expect(main).toContain("runRendererSmoke");
    expect(main).toContain("orbit:getActivitySessionDetail");
    expect(smoke).toContain("ORBIT_SKIP_LOGIN_ITEM_SETTINGS");
    expect(smoke).toContain("ORBIT_E2E_RENDERER_SMOKE");
  });
});
