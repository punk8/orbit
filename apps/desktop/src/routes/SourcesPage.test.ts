import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("SourcesPage source governance controls", () => {
  it("renders source reconfiguration, cursor reset, deletion, and cleanup controls", () => {
    const source = readFileSync(new URL("./SourcesPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("onPreviewSourceImport");
    expect(source).toContain("onConfirmSourceImport");
    expect(source).toContain("source.importPreview");
    expect(source).toContain("source.confirmImport");
    expect(source).toContain("source.importOnly");
    expect(source).toContain("source.importBoundary");
    expect(source).toContain("source.previewEventCount");
    expect(source).toContain("action.reconfigure");
    expect(source).toContain("action.resetCursor");
    expect(source).toContain("action.deleteSource");
    expect(source).toContain("action.cleanupLegacyPrivacy");
    expect(source).toContain("action.cleanupPerceptionSidecars");
    expect(source).toContain("source.cursorPresent");
    expect(source).toContain("source.cursorEmpty");
    expect(source).toContain("section.perceptionSources");
    expect(source).toContain("onUpdatePerceptionSourceRuntime");
    expect(source).toContain("perception.permissions");
    expect(source).toContain("perception.policySnapshot");
    expect(source).toContain("perception.protectedApps");
    expect(source).toContain("perception.samplingPreset");
    expect(source).toContain("perception.rawRetention");
    expect(source).toContain("onCaptureScreenOcr");
    expect(source).toContain("source.manualScreenOcrTitle");
    expect(source).toContain("source.manualScreenOcrBoundary");
    expect(source).toContain("action.captureScreenOcr");
    expect(source).toContain("source.runtimeNextRun");
    expect(source).toContain("source.runtimeBackoff");
    expect(source).toContain("source.runtimeInterval");
    expect(source).toContain("runtimeSourceById");
  });

  it("offers only explicit import setup for expanded real sources", () => {
    const source = readFileSync(new URL("./SourcesPage.tsx", import.meta.url), "utf8");

    expect(source).toContain('"project_directory"');
    expect(source).toContain('"browser_import"');
    expect(source).toContain('"terminal_import"');
    expect(source).toContain('"file_activity_import"');
    expect(source).toContain("source.realSourceImportBoundary");
    expect(source).toContain("source.projectDirectoryImport");
    expect(source).toContain("source.browserImport");
    expect(source).toContain("source.terminalImport");
    expect(source).toContain("source.fileActivityImport");
  });

  it("does not expose bundled fixtures as a first-run product setup path", () => {
    const source = readFileSync(new URL("./SourcesPage.tsx", import.meta.url), "utf8");

    expect(source).not.toContain('onSetupSource("fixtures")');
    expect(source).not.toContain('useState("fixtures/realistic/codex")');
    expect(source).not.toContain('useState("fixtures/realistic/local-agent")');
    expect(source).not.toContain('useState("fixtures/seatalk")');
    expect(source).not.toContain("source.fixturesDescription");
  });
});
