import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("desktop main process runtime guards", () => {
  it("supports skipping login item writes in smoke tests", () => {
    const main = readFileSync(new URL("./main.ts", import.meta.url), "utf8");
    const smoke = readFileSync(new URL("../scripts/e2e-smoke.mjs", import.meta.url), "utf8");

    expect(main).toContain("ORBIT_SKIP_LOGIN_ITEM_SETTINGS");
    expect(main).toContain("ORBIT_PACKAGED_SMOKE");
    expect(main).toContain("ORBIT_E2E_RENDERER_SMOKE");
    expect(main).toContain("runRendererSmoke");
    expect(main).toContain("runPackagedSmoke");
    expect(main).toContain('reviewKnowledgeForDesktop(firstArtifact.id, "confirm")');
    expect(main).toContain('assertScrollable(".settings-content")');
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
    expect(main).toContain("orbit:captureScreenOcr");
    expect(main).toContain('await click(\'[data-page-id="handoff"]\')');
    expect(main).toContain('await click(\'[data-handoff-action="generate-today"]\')');
    expect(main).toContain(".handoff-preview");
    expect(main).toContain(".handoff-excluded-list");
    expect(main).toMatch(
      /await waitFor\("\.handoff-excluded-list"\);[\s\S]*await click\('\[data-page-id="settings"\]'\);[\s\S]*await waitFor\("\.provider-boundary"\);/
    );
    expect(main).toContain("orbit:updatePerceptionSourceRuntime");
    expect(main).toContain("orbit:updatePerceptionSourcePolicy");
    expect(main).toContain("orbit:updatePerceptionProviderRoute");
    expect(main).toContain("orbit:updatePerceptionSamplingPreset");
    expect(main).toContain("DesktopObservationService");
    expect(main).toContain(".knowledge-list-item");
    expect(main).toContain(".memory-list-item");
    expect(main).toContain(".recommendation-list-item");
    expect(smoke).toContain("ORBIT_SKIP_LOGIN_ITEM_SETTINGS");
    expect(smoke).toContain("ORBIT_E2E_RENDERER_SMOKE");
  });

  it("keeps manual perception sources out of generic background source ingestion", () => {
    const data = readFileSync(new URL("./data.ts", import.meta.url), "utf8");

    expect(data).toContain("isGenericBackgroundSource");
    expect(data).toContain("supportedBackgroundSourceKinds");
    expect(data).toContain("supportedSourceKinds: supportedBackgroundSourceKinds");
    expect(data).toContain("sourceKind === \"codex\"");
    expect(data).toContain("sourceKind === \"local_agent\"");
    expect(data).toContain("sourceKind === \"seatalk\"");
  });
});
