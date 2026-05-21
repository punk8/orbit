import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("SettingsPage privacy and provider hardening", () => {
  it("renders provider boundaries, privacy policy, indexing state, and guarded data operations", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("settings.providerTaskBoundary");
    expect(source).toContain("settings.providerTaskSyntheticTest");
    expect(source).toContain("settingsNav.privacy");
    expect(source).toContain("section.sourcePolicyMatrix");
    expect(source).toContain("settings.aiAllowedSources");
    expect(source).toContain("settingsNav.indexing");
    expect(source).toContain("settings.vectorIndexDisabled");
    expect(source).toContain("settings.agentInterfaceReadOnly");
    expect(source).toContain("settings.blockedUntilReview");
    expect(source).toContain("settings.reindexIdempotent");
    expect(source).toContain("confirm.clearLocalData");
  });
});
