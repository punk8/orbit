import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("desktop main process runtime guards", () => {
  it("supports skipping login item writes in packaged smoke tests", () => {
    const main = readFileSync(new URL("./main.ts", import.meta.url), "utf8");

    expect(main).toContain("ORBIT_SKIP_LOGIN_ITEM_SETTINGS");
    expect(main).toContain("ORBIT_PACKAGED_SMOKE");
    expect(main).toContain("runPackagedSmoke");
    expect(main).toContain("orbit:getActivitySessionDetail");
    expect(main).toContain("orbit:searchKnowledge");
    expect(main).toContain("orbit:previewSourceImport");
    expect(main).toContain("orbit:confirmSourceImport");
    expect(main).toContain("orbit:getKnowledgeArtifactDetail");
    expect(main).toContain("orbit:editKnowledge");
    expect(main).toContain("orbit:searchMemory");
    expect(main).toContain("orbit:getMemoryDetail");
    expect(main).toContain("orbit:editMemory");
    expect(main).toContain("orbit:getRecommendationDetail");
    expect(main).toContain("orbit:cleanupPerceptionSidecars");
    expect(main).toContain("orbit:startObservation");
    expect(main).toContain("orbit:captureScreenOcr");
    expect(main).toContain("orbit:updatePerceptionSourceRuntime");
    expect(main).toContain("orbit:updatePerceptionSourcePolicy");
    expect(main).toContain("orbit:updatePerceptionProviderRoute");
    expect(main).toContain("orbit:updatePerceptionSamplingPreset");
    expect(main).toContain("DesktopObservationService");
    expect(main).toContain("detectScreenRecordingPermissionStatus");
    expect(main).toContain("syncDogfoodRuntimeFromSystemPermission");
    expect(main).toContain("syncDogfoodRuntimePermissionForDesktop");
    expect(main).toContain("readDesktopRuntimeLocale");
    expect(main).toContain("runtimeLocale.dogfoodRuntimeState");
    expect(main).toContain("runtimeLocale.dogfoodNextAction");
    expect(main).toContain("dogfoodRuntime.nextAction");
    expect(main).toContain("repair_native_helper");
    expect(main).toContain("runtimeLocale.tray.showOrbit");
    expect(main).toContain("runtimeLocale.tray.openActivity");
    expect(main).toContain("runtimeLocale.tray.openSettings");
    expect(main).toContain("runtimeLocale.tray.cleanupPrivacy");
    expect(main).toContain("captureScreenOcrBurstForDesktop");
    expect(main).toContain('window.webContents.send("orbit:navigate", page)');
  });

  it("keeps manual perception sources out of generic background source ingestion", () => {
    const data = readFileSync(new URL("./data.ts", import.meta.url), "utf8");

    expect(data).toContain("isGenericBackgroundSource");
    expect(data).toContain("readBackgroundSyncableSources");
    expect(data).toContain("config?.mode === \"import_only\"");
    expect(data).toContain("supportedBackgroundSourceKinds");
    expect(data).toContain("supportedSourceKinds: supportedBackgroundSourceKinds");
    expect(data).toContain("sourceKind === \"codex\"");
    expect(data).toContain("sourceKind === \"local_agent\"");
    expect(data).toContain("sourceKind === \"seatalk\"");
    expect(data).toContain("syncDogfoodRuntimePermissionForDesktop");
  });

  it("uses captured OCR text for real screen/OCR burst ingestion", () => {
    const data = readFileSync(new URL("./data.ts", import.meta.url), "utf8");
    const burstFunction = data.slice(
      data.indexOf("export async function captureScreenOcrBurstForDesktop"),
      data.indexOf("export function generateHandoffForDesktop")
    );

    expect(burstFunction).toContain("CapturedTextOcrEngine");
    expect(burstFunction).not.toContain("MockOcrEngine");
  });

  it("routes both real screen capture entrypoints through vision summary ingestion", () => {
    const data = readFileSync(new URL("./data.ts", import.meta.url), "utf8");
    const singleCaptureFunction = data.slice(
      data.indexOf("export async function captureScreenOcrForDesktop"),
      data.indexOf("export async function captureScreenOcrBurstForDesktop")
    );
    const burstFunction = data.slice(
      data.indexOf("export async function captureScreenOcrBurstForDesktop"),
      data.indexOf("export function generateHandoffForDesktop")
    );

    expect(singleCaptureFunction).toContain("runDesktopVisionSummaryIngestion");
    expect(burstFunction).toContain("runDesktopVisionSummaryIngestion");
  });

  it("does not reuse source cursors for one-shot screen/OCR capture frames", () => {
    const data = readFileSync(new URL("./data.ts", import.meta.url), "utf8");
    const singleCaptureFunction = data.slice(
      data.indexOf("export async function captureScreenOcrForDesktop"),
      data.indexOf("export async function captureScreenOcrBurstForDesktop")
    );

    expect(singleCaptureFunction).toContain("desktop_manual_live_screen_ocr");
    expect(singleCaptureFunction).not.toContain("sourceRepository.getCursor(adapter.id)");
    expect(singleCaptureFunction).toContain("ingestEventsFromAdapter(adapter, eventRepository)");
  });

  it("wires background ticks to automatic timer-triggered screen/OCR bursts", () => {
    const main = readFileSync(new URL("./main.ts", import.meta.url), "utf8");

    expect(main).toContain("runScreenOcrAutoCaptureTick");
    expect(main).toContain("captureScreenOcrBurstForDesktop(\"timer\")");
    expect(main).toContain("screenOcrAutoCaptureRunning");
  });
});
