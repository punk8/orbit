import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("SettingsPage privacy and provider hardening", () => {
  it("renders provider boundaries, privacy policy, indexing state, and guarded data operations", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("settings.providerTaskBoundary");
    expect(source).toContain("settings.perceptionProviderRouting");
    expect(source).toContain("settings.providerRuntimeRegistry");
    expect(source).toContain("snapshot.aiProviderRuntime.tasks");
    expect(source).toContain("settingsNav.privacy");
    expect(source).toContain("section.sourcePolicyMatrix");
    expect(source).toContain("section.perceptionPolicyMatrix");
    expect(source).toContain("section.perceptionBudgets");
    expect(source).toContain("section.auditReview");
    expect(source).toContain("settings.screenRecordingPermission");
    expect(source).toContain("settings.samplingPreset");
    expect(source).toContain("settings.framesPerBurst");
    expect(source).toContain("settings.burstInterval");
    expect(source).toContain("settings.rawRetention");
    expect(source).toContain("settings.protectedApps");
    expect(source).toContain("settings.auditReviewCoverage");
    expect(source).toContain("snapshot.auditReview");
    expect(source).toContain("snapshot.perception.policySnapshot.id");
    expect(source).toContain("onUpdatePerceptionSourcePolicy");
    expect(source).toContain("onUpdatePerceptionProviderRoute");
    expect(source).toContain("settings.aiAllowedSources");
    expect(source).toContain("settingsNav.indexing");
    expect(source).toContain("settings.vectorIndexDisabled");
    expect(source).toContain("settings.agentInterfaceReadOnly");
    expect(source).toContain("settings.blockedUntilReview");
    expect(source).toContain("settings.reindexIdempotent");
    expect(source).toContain("settings.backgroundScheduler");
    expect(source).toContain("settings.backgroundSourceBudget");
    expect(source).toContain("settings.backgroundResourceLimits");
    expect(source).toContain("snapshot.runtime.background.policy");
    expect(source).toContain("settings.screenOcrRuntimeTitle");
    expect(source).toContain("settings.screenOcrOnboardingTitle");
    expect(source).toContain("settings.screenOcrOnboardingOpenPermission");
    expect(source).toContain("settings.screenOcrLastTransition");
    expect(source).toContain("settings.screenOcrNextAction");
    expect(source).toContain("data-screen-ocr-action=\"resume\"");
    expect(source).toContain("data-screen-ocr-action=\"pause\"");
    expect(source).toContain("data-screen-ocr-action=\"stop\"");
    expect(source).toContain("data-screen-ocr-action=\"capture\"");
    expect(source).toContain("onUpdatePerceptionSourceRuntime(\"screen\"");
    expect(source).toContain("onCaptureScreenOcrBurst");
    expect(source).toContain("onCleanupPerceptionSidecars");
    expect(source).toContain("confirm.clearLocalData");
  });

  it("keeps Screen/OCR runtime and onboarding copy i18n-backed in English and Chinese", () => {
    const i18n = readFileSync(new URL("../i18n.tsx", import.meta.url), "utf8");

    expect(i18n).toContain('"settings.screenOcrRuntimeTitle"');
    expect(i18n).toContain('"settings.screenOcrOnboardingTitle"');
    expect(i18n).toContain('"settings.screenOcrOnboardingOpenPermission"');
    expect(i18n).toContain('"dogfoodRuntime.observing"');
    expect(i18n).toContain('"dogfoodRuntime.needs_permission"');
    expect(i18n).toContain('"dogfoodNextAction.grant_screen_recording_permission"');
    expect(i18n).toContain("屏幕 / OCR");
  });

  it("does not expose mock providers as product configuration choices", () => {
    const source = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");
    const i18n = readFileSync(new URL("../i18n.tsx", import.meta.url), "utf8");

    expect(source).not.toContain('<option value="mock">');
    expect(source).not.toContain("settings.providerTaskMockDrafting");
    expect(source).not.toContain("provider.mock");
    expect(i18n).not.toContain("settings.providerTaskMockDrafting");
    expect(i18n).not.toContain("provider.mock");
  });

  it("keeps settings navigation and content independently scrollable", () => {
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

    expect(styles).toMatch(/\.workspace\s*{[^}]*min-height:\s*0;/s);
    expect(styles).toMatch(/\.page-grid\s*{[^}]*min-height:\s*0;/s);
    expect(styles).toMatch(/\.settings-layout\s*{[^}]*flex:\s*1;/s);
    expect(styles).toMatch(/\.settings-layout\s*{[^}]*height:\s*100%;/s);
    expect(styles).toMatch(/\.settings-layout\s*{[^}]*min-height:\s*0;/s);
    expect(styles).toMatch(/\.settings-layout\s*{[^}]*overflow:\s*hidden;/s);
    expect(styles).toMatch(/\.settings-subnav\s*{[^}]*overflow:\s*auto;/s);
    expect(styles).toMatch(/\.settings-content\s*{[^}]*overflow:\s*auto;/s);
  });
});
