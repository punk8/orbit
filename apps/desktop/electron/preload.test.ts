import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("desktop preload API", () => {
  it("exposes source governance actions", () => {
    const source = readFileSync(new URL("./preload.ts", import.meta.url), "utf8");

    expect(source).toContain("reconfigureSource");
    expect(source).toContain("getActivitySessionDetail");
    expect(source).toContain("searchKnowledge");
    expect(source).toContain("getKnowledgeArtifactDetail");
    expect(source).toContain("editKnowledge");
    expect(source).toContain("searchMemory");
    expect(source).toContain("getMemoryDetail");
    expect(source).toContain("editMemory");
    expect(source).toContain("getRecommendationDetail");
    expect(source).toContain("deleteSource");
    expect(source).toContain("resetSourceCursor");
    expect(source).toContain("cleanupLegacyEventPrivacy");
    expect(source).toContain("cleanupPerceptionSidecars");
    expect(source).toContain("generateHandoff");
    expect(source).toContain("startObservation");
    expect(source).toContain("pauseObservation");
    expect(source).toContain("resumeObservation");
    expect(source).toContain("stopObservation");
    expect(source).toContain("captureScreenOcr");
    expect(source).toContain("updatePerceptionSourceRuntime");
    expect(source).toContain("updatePerceptionSourcePolicy");
    expect(source).toContain("updatePerceptionProviderRoute");
    expect(source).toContain("updatePerceptionSamplingPreset");
  });
});
