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
    expect(main).toContain("orbit:searchKnowledge");
    expect(main).toContain("orbit:getKnowledgeArtifactDetail");
    expect(main).toContain("orbit:editKnowledge");
    expect(main).toContain("orbit:searchMemory");
    expect(main).toContain("orbit:getMemoryDetail");
    expect(main).toContain("orbit:editMemory");
    expect(main).toContain("orbit:getRecommendationDetail");
    expect(main).toContain("orbit:cleanupPerceptionSidecars");
    expect(main).toContain("orbit:startObservation");
    expect(main).toContain("orbit:updatePerceptionSourceRuntime");
    expect(main).toContain("orbit:updatePerceptionSourcePolicy");
    expect(main).toContain("orbit:updatePerceptionProviderRoute");
    expect(main).toContain("DesktopObservationService");
    expect(main).toContain(".knowledge-list-item");
    expect(main).toContain(".memory-list-item");
    expect(main).toContain(".recommendation-list-item");
    expect(smoke).toContain("ORBIT_SKIP_LOGIN_ITEM_SETTINGS");
    expect(smoke).toContain("ORBIT_E2E_RENDERER_SMOKE");
  });
});
