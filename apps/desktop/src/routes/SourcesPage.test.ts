import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("SourcesPage source governance controls", () => {
  it("renders source reconfiguration, cursor reset, deletion, and cleanup controls", () => {
    const source = readFileSync(new URL("./SourcesPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("onPreviewSourceImport");
    expect(source).toContain("onChooseSourceImportPath");
    expect(source).toContain("onConfirmSourceImport");
    expect(source).toContain("source.importPreview");
    expect(source).toContain("source.chooseImportPath");
    expect(source).toContain("source.confirmImport");
    expect(source).toContain("source.importOnly");
    expect(source).toContain("source.importBoundary");
    expect(source).toContain("source.importFocusHint");
    expect(source).toContain("source.previewEventCount");
    expect(source).toContain("source.previewAdapter");
    expect(source).toContain("source.previewApps");
    expect(source).toContain("source.previewReadableFields");
    expect(source).toContain("source.previewSampleEvents");
    expect(source).toContain("source.previewSampleBoundary");
    expect(source).toContain("preview.sampleEvents");
    expect(source).toContain("sample.sourcePointer");
    expect(source).toContain("sample.summary");
    expect(source).toContain("source.importNoEvents");
    expect(source).toContain("preview.eventCount === 0");
    expect(source).toContain("formatLastImportSummary");
    expect(source).toContain("source.lastImportRead");
    expect(source).toContain("source.lastImportInserted");
    expect(source).toContain("source.lastImportSkipped");
    expect(source).toContain("source.lastImportWarnings");
    expect(source).toContain("preview.permission.canStoreRaw");
    expect(source).toContain("preview.permission.canUseForAI");
    expect(source).toContain("preview.permission.canExportToAgent");
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

  it("explains expected self-serve input formats before previewing real source imports", () => {
    const source = readFileSync(new URL("./SourcesPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("sourceImportGuide");
    expect(source).toContain("sourceImportPathTypeLabel");
    expect(source).toContain("source.importGuide");
    expect(source).toContain("source.pathType.file");
    expect(source).toContain("source.pathType.folder");
    expect(source).toContain("source.guide.projectDirectory");
    expect(source).toContain("source.guide.browser");
    expect(source).toContain("source.guide.terminal");
    expect(source).toContain("source.guide.fileActivity");
    expect(source).toContain("source.sample.browser");
    expect(source).toContain("source.sample.terminal");
    expect(source).toContain("source.sample.fileActivity");
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
