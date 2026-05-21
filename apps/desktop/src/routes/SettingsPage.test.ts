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

  it("keeps settings content scrollable inside the fixed-height shell", () => {
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

    expect(styles).toMatch(/\.settings-layout\s*{[^}]*flex:\s*1;/s);
    expect(styles).toMatch(/\.settings-layout\s*{[^}]*min-height:\s*0;/s);
    expect(styles).toMatch(/\.settings-layout\s*{[^}]*overflow:\s*auto;/s);
  });
});
