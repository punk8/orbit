import {
  audioPermission,
  CapturedTextOcrEngine,
  MacScreenOcrCaptureHelper,
  MockScreenCaptureNativeHelper,
  MockOcrEngine,
  OCR_OBSERVATION_ADAPTER_ID,
  OcrObservationAdapter,
  readAudioFixtures,
  readScreenCaptureFixtures,
  runScreenBurstScheduler,
  SCREEN_OBSERVATION_ADAPTER_ID,
  ScreenObservationAdapter,
  ScreenObservationSession,
  type ScreenOcrCaptureHelper,
  type ScreenCaptureFrame,
  type ScreenCaptureScope,
  screenPermission,
  TRANSCRIPT_OBSERVATION_ADAPTER_ID,
  TranscriptObservationAdapter,
  transcriptPolicyFromPerceptionStatus,
  VISION_SUMMARY_ADAPTER_ID,
  VisionSummaryAdapter,
  visionPolicyFromPerceptionStatus
} from "@orbit/adapters";
import {
  buildTranscriptionProvider,
  createOpenAICompatibleVisionProvider,
  disabledVisionProvider,
  disabledTranscriptionProvider,
  mockVisionProvider,
  readAIProviderConfigFromEnv,
  type VisionProvider
} from "@orbit/ai";
import {
  DEFAULT_RAW_FRAME_TTL_MINUTES,
  evaluatePerceptionResourceState,
  ingestEventsFromAdapter,
  normalizeObservationInput
} from "@orbit/core";
import type { SourceAdapter } from "@orbit/core";
import {
  AuditRepository,
  cleanupPerceptionSidecars,
  deletePerceptionSourceEvents,
  EventRepository,
  openOrbitDatabase,
  ignoreCurrentPerceptionContextRule,
  readPerceptionProviderKind,
  readPerceptionProviderTask,
  readPerceptionSourceKind,
  readPerceptionStatus,
  SourceRepository,
  syncDogfoodRuntimePermission,
  upsertProtectedAppRule,
  updatePerceptionProviderRoute,
  updatePerceptionSamplingPreset,
  updatePerceptionSourcePolicy,
  updatePerceptionSourceRuntime
} from "@orbit/db";
import type { IgnoreCurrentContextInput, ProtectedRuleInput } from "@orbit/db";
import {
  evaluatePerceptionReleaseGate,
  type ManualSmokeScenario,
  type ManualSmokeStatus
} from "@orbit/privacy";
import { getCliConfig } from "../config";
import { runSemanticPipeline, type SemanticPipelineResult } from "./semanticPipeline";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  PerceptionControlPlaneStatus,
  PerceptionPermissionStatus,
  PerceptionResourceState,
  PerceptionSamplingPresetName,
  PerceptionSourcePolicyPatch
} from "@orbit/core";

export interface PerceptionStatusResult {
  orbitHome: string;
  dbPath: string;
  perception: PerceptionControlPlaneStatus;
}

export interface SyncPerceptionDogfoodPermissionInput {
  permission: string;
}

export interface UpdatePerceptionPolicyInput {
  sourceKind: string;
  patch: PerceptionSourcePolicyPatch;
}

export interface UpdatePerceptionProviderRouteInput {
  task: string;
  provider: string;
}

export interface UpdatePerceptionSamplingPresetInput {
  preset: string;
}

export interface ScreenOcrSmokeResult {
  orbitHome: string;
  dbPath: string;
  scope: ScreenCaptureScope;
  transitions: Array<{
    action: "start" | "capture" | "pause" | "resume" | "stop";
    status: string;
    capturedFrames: number;
  }>;
}

export interface CaptureScreenOcrCommandResult {
  orbitHome: string;
  dbPath: string;
  mode: "manual_live_screen_ocr" | "manual_mock_screen_burst";
  sources: Array<{
    adapterId: string;
    read: number;
    inserted: number;
    skipped: number;
    nextCursor?: string;
    warnings: string[];
  }>;
  totals: {
    read: number;
    inserted: number;
    skipped: number;
  };
  warnings: string[];
  pipeline: SemanticPipelineResult;
}

export interface CaptureScreenOcrBurstNowOptions {
  mock?: boolean;
}

export interface CaptureScreenOcrBurstNowResult extends CaptureScreenOcrCommandResult {
  mode: "manual_mock_screen_burst";
  burst: {
    id: string;
    status: string;
    skipReason?: string;
    frames: Array<{
      id: string;
      frameIndex: number;
      capturedAt: string;
      frameHash: string;
      sourcePointer: string;
    }>;
    rawStored: boolean;
    auditOperations: string[];
  };
}

export interface CaptureScreenOcrOptions {
  helper?: ScreenOcrCaptureHelper;
  helperPath?: string;
}

export interface PerceptionCleanupCommandResult {
  orbitHome: string;
  dbPath: string;
  cleanup: ReturnType<typeof cleanupPerceptionSidecars>;
}

export interface PerceptionDeleteEventsCommandResult {
  orbitHome: string;
  dbPath: string;
  deletion: ReturnType<typeof deletePerceptionSourceEvents>;
}

export interface PerceptionDisableSourceDeleteRawCommandResult {
  orbitHome: string;
  dbPath: string;
  perception: PerceptionControlPlaneStatus;
  cleanup: ReturnType<typeof cleanupPerceptionSidecars>;
}

export interface PerceptionReleaseGateCommandResult {
  orbitHome: string;
  dbPath: string;
  releaseGate: ReturnType<typeof evaluatePerceptionReleaseGate>;
}

export interface TranscribeFixtureCommandResult {
  orbitHome: string;
  dbPath: string;
  source: {
    adapterId: string;
    read: number;
    inserted: number;
    skipped: number;
    nextCursor?: string;
    warnings: string[];
  };
  pipeline: SemanticPipelineResult;
}

export interface VisionFixtureCommandResult {
  orbitHome: string;
  dbPath: string;
  sources: Array<{
    adapterId: string;
    read: number;
    inserted: number;
    skipped: number;
    nextCursor?: string;
    warnings: string[];
  }>;
  pipeline: SemanticPipelineResult;
}

export function getPerceptionStatus(): PerceptionStatusResult {
  const config = getCliConfig();
  const database = openOrbitDatabase({ orbitHome: config.orbitHome });
  try {
    return {
      orbitHome: database.orbitHome,
      dbPath: database.dbPath,
      perception: readPerceptionStatus(database.db)
    };
  } finally {
    database.close();
  }
}

export function syncPerceptionDogfoodPermission(
  input: SyncPerceptionDogfoodPermissionInput
): PerceptionStatusResult {
  const config = getCliConfig();
  const database = openOrbitDatabase({ orbitHome: config.orbitHome });
  try {
    return {
      orbitHome: database.orbitHome,
      dbPath: database.dbPath,
      perception: syncDogfoodRuntimePermission(
        database.db,
        readPerceptionPermissionStatus(input.permission)
      )
    };
  } finally {
    database.close();
  }
}

export function setPerceptionSourcePolicy(
  input: UpdatePerceptionPolicyInput
): PerceptionStatusResult {
  const config = getCliConfig();
  const database = openOrbitDatabase({ orbitHome: config.orbitHome });
  try {
    const sourceKind = readPerceptionSourceKind(input.sourceKind);
    const perception = updatePerceptionSourcePolicy(database.db, sourceKind, input.patch);
    if (input.patch.canStoreRaw === false || input.patch.rawRetentionTtlMinutes === null) {
      cleanupPerceptionSidecars(database, { sourceKind, dryRun: true });
    }
    return {
      orbitHome: database.orbitHome,
      dbPath: database.dbPath,
      perception
    };
  } finally {
    database.close();
  }
}

export function setPerceptionProviderRoute(
  input: UpdatePerceptionProviderRouteInput
): PerceptionStatusResult {
  const config = getCliConfig();
  const database = openOrbitDatabase({ orbitHome: config.orbitHome });
  try {
    return {
      orbitHome: database.orbitHome,
      dbPath: database.dbPath,
      perception: updatePerceptionProviderRoute(
        database.db,
        readPerceptionProviderTask(input.task),
        readPerceptionProviderKind(input.provider)
      )
    };
  } finally {
    database.close();
  }
}

export function setPerceptionSamplingPreset(
  input: UpdatePerceptionSamplingPresetInput
): PerceptionStatusResult {
  const config = getCliConfig();
  const database = openOrbitDatabase({ orbitHome: config.orbitHome });
  try {
    return {
      orbitHome: database.orbitHome,
      dbPath: database.dbPath,
      perception: updatePerceptionSamplingPreset(database.db, readSamplingPreset(input.preset))
    };
  } finally {
    database.close();
  }
}

export function setPerceptionProtectedRule(input: ProtectedRuleInput): PerceptionStatusResult {
  const config = getCliConfig();
  const database = openOrbitDatabase({ orbitHome: config.orbitHome });
  try {
    return {
      orbitHome: database.orbitHome,
      dbPath: database.dbPath,
      perception: upsertProtectedAppRule(database.db, input)
    };
  } finally {
    database.close();
  }
}

export function ignoreCurrentPerceptionContext(
  input: IgnoreCurrentContextInput
): PerceptionStatusResult {
  const config = getCliConfig();
  const database = openOrbitDatabase({ orbitHome: config.orbitHome });
  try {
    return {
      orbitHome: database.orbitHome,
      dbPath: database.dbPath,
      perception: ignoreCurrentPerceptionContextRule(database.db, input)
    };
  } finally {
    database.close();
  }
}

export async function runScreenOcrSmoke(
  scopeKind: ScreenCaptureScope["kind"]
): Promise<ScreenOcrSmokeResult> {
  const config = getCliConfig();
  const database = openOrbitDatabase({ orbitHome: config.orbitHome });
  const audit = new AuditRepository(database.db);
  const scope = smokeScope(scopeKind);
  const helper = new MockScreenCaptureNativeHelper({
    permission: screenPermission("granted"),
    frames: [
      {
        id: "smoke_frame_1",
        capturedAt: new Date("2026-05-21T00:00:00.000Z").toISOString(),
        runtimeSessionId: "screen-ocr-smoke",
        sequence: 1,
        scope,
        app: {
          name: "Orbit",
          bundleId: "app.orbit.local"
        },
        window: {
          title: "Orbit Screen/OCR Smoke"
        },
        width: 1280,
        height: 720,
        frameHash: "smoke_frame_hash_1",
        redactedSummary: "Mock screen/OCR smoke frame."
      }
    ]
  });
  const session = new ScreenObservationSession({
    helper,
    scope,
    budget: {
      maxFrames: 1,
      minIntervalMs: 30_000
    }
  });

  const transitions: ScreenOcrSmokeResult["transitions"] = [];
  try {
    audit.log("perception.capture.start", "perception_source", "screen", { scope });
    const started = await session.start();
    transitions.push({
      action: "start",
      status: started.status,
      capturedFrames: started.capturedFrames
    });
    const captured = await session.captureOnce();
    audit.log("perception.capture.frame", "perception_source", "screen", {
      scope,
      capturedFrames: captured.length,
      rawStored: false
    });
    transitions.push({
      action: "capture",
      status: session.snapshot().status,
      capturedFrames: captured.length
    });
    const paused = session.pause();
    audit.log("perception.capture.pause", "perception_source", "screen", { scope });
    transitions.push({
      action: "pause",
      status: paused.status,
      capturedFrames: paused.capturedFrames
    });
    const resumed = session.resume();
    audit.log("perception.capture.resume", "perception_source", "screen", { scope });
    transitions.push({
      action: "resume",
      status: resumed.status,
      capturedFrames: resumed.capturedFrames
    });
    const stopped = session.stop();
    audit.log("perception.capture.stop", "perception_source", "screen", {
      scope,
      capturedFrames: stopped.capturedFrames
    });
    transitions.push({
      action: "stop",
      status: stopped.status,
      capturedFrames: stopped.capturedFrames
    });

    return { orbitHome: database.orbitHome, dbPath: database.dbPath, scope, transitions };
  } finally {
    database.close();
  }
}

export async function captureScreenOcrOnce(
  options: CaptureScreenOcrOptions = {}
): Promise<CaptureScreenOcrCommandResult> {
  const config = getCliConfig();
  const database = openOrbitDatabase({ orbitHome: config.orbitHome });
  try {
    const sourceRepository = new SourceRepository(database.db);
    const eventRepository = new EventRepository(database.db);
    const auditRepository = new AuditRepository(database.db);
    const perception = readPerceptionStatus(database.db);
    const helper =
      options.helper ??
      new MacScreenOcrCaptureHelper({
        ...(options.helperPath ? { helperPath: options.helperPath } : {})
      });
    const capture = await helper.captureOnce();
    const warnings = [...capture.warnings];
    const permission =
      capture.permission ?? screenPermission(capture.frame ? "granted" : "unknown");
    const results: CaptureScreenOcrCommandResult["sources"] = [];

    if (!capture.frame) {
      auditRepository.log("perception.capture_screen_ocr", "source", "perception_screen", {
        mode: "manual_live_screen_ocr",
        inserted: 0,
        permission: permission.status,
        warnings
      });
      const pipeline = runSemanticPipeline(database);
      return {
        orbitHome: database.orbitHome,
        dbPath: database.dbPath,
        mode: "manual_live_screen_ocr",
        sources: [],
        totals: { read: 0, inserted: 0, skipped: 0 },
        warnings,
        pipeline
      };
    }

    const screenAdapter = new ScreenObservationAdapter({
      id: SCREEN_OBSERVATION_ADAPTER_ID,
      frames: [capture.frame],
      scope: capture.frame.scope,
      permission,
      protectedApps: perception.protectedApps,
      allowRawFrameStorage: false,
      canUseForAI:
        perception.sources.find((source) => source.sourceKind === "screen")?.policy.canUseForAI ===
        true,
      canExportToAgent:
        perception.sources.find((source) => source.sourceKind === "screen")?.policy
          .canExportToAgent === true
    });

    const adapters: SourceAdapter[] = [screenAdapter];
    if (capture.ocr?.text.trim()) {
      adapters.push(
        new OcrObservationAdapter({
          id: OCR_OBSERVATION_ADAPTER_ID,
          frames: [capture.frame],
          scope: capture.frame.scope,
          engine: new CapturedTextOcrEngine(new Map([[capture.frame.frameHash, capture.ocr]])),
          permission,
          protectedApps: perception.protectedApps,
          canUseForAI:
            perception.sources.find((source) => source.sourceKind === "ocr")?.policy.canUseForAI ===
            true,
          canExportToAgent:
            perception.sources.find((source) => source.sourceKind === "ocr")?.policy
              .canExportToAgent === true
        })
      );
    } else {
      warnings.push("Screen capture succeeded, but OCR produced no text.");
    }

    for (const adapter of adapters) {
      sourceRepository.upsertFromAdapter(adapter);
      const cursor = sourceRepository.getCursor(adapter.id);
      const result = await ingestEventsFromAdapter(adapter, eventRepository, cursor);
      sourceRepository.setCursor(adapter.id, result.nextCursor);
      sourceRepository.recordSyncSuccess(adapter.id, { lastEventAt: result.lastEventAt });
      const sourceWarnings = [...warnings, ...result.warnings];
      auditRepository.log("perception.capture_screen_ocr", "source", adapter.id, {
        mode: "manual_live_screen_ocr",
        kind: adapter.kind,
        read: result.read,
        inserted: result.inserted,
        skipped: result.skipped,
        rawStored: false,
        warnings: sourceWarnings,
        protectedAudit: result.audit
      });
      for (const entry of result.audit) {
        auditRepository.log(entry.operation, "source", adapter.id, {
          mode: "manual_live_screen_ocr",
          kind: adapter.kind,
          protectedRuleId: entry.protectedRuleId,
          protectedReason: entry.protectedReason,
          protectedContentDropped: entry.protectedContentDropped
        });
      }
      results.push({
        adapterId: result.adapterId,
        read: result.read,
        inserted: result.inserted,
        skipped: result.skipped,
        ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
        warnings: sourceWarnings
      });
    }

    const boundaryEvent = normalizeObservationInput(
      {
        type: "observation_state",
        tier: "tier3",
        sourceKind: "screen",
        occurredAt: new Date(new Date(capture.frame.capturedAt).getTime() + 1).toISOString(),
        runtimeSessionId: capture.frame.runtimeSessionId,
        sequence: capture.frame.sequence + 10_000
      },
      { adapterId: SCREEN_OBSERVATION_ADAPTER_ID, protectedApps: perception.protectedApps }
    );
    const insertedBoundary = eventRepository.upsertEvent(boundaryEvent);
    auditRepository.log(
      "perception.capture_screen_ocr_boundary",
      "source",
      SCREEN_OBSERVATION_ADAPTER_ID,
      {
        mode: "manual_live_screen_ocr",
        inserted: insertedBoundary
      }
    );

    const pipeline = runSemanticPipeline(database);
    return {
      orbitHome: database.orbitHome,
      dbPath: database.dbPath,
      mode: "manual_live_screen_ocr",
      sources: results,
      totals: {
        read: results.reduce((total, result) => total + result.read, 0),
        inserted: results.reduce((total, result) => total + result.inserted, 0),
        skipped: results.reduce((total, result) => total + result.skipped, 0)
      },
      warnings,
      pipeline
    };
  } finally {
    database.close();
  }
}

export async function captureScreenOcrBurstNow(
  options: CaptureScreenOcrBurstNowOptions = {}
): Promise<CaptureScreenOcrBurstNowResult> {
  if (options.mock !== true) {
    throw new Error("Only --mock capture bursts are available before the native helper is packaged.");
  }
  const config = getCliConfig();
  const database = openOrbitDatabase({ orbitHome: config.orbitHome });
  try {
    const sourceRepository = new SourceRepository(database.db);
    const eventRepository = new EventRepository(database.db);
    const auditRepository = new AuditRepository(database.db);
    let perception = readPerceptionStatus(database.db);
    if (perception.dogfoodRuntime.permission !== "granted") {
      perception = syncDogfoodRuntimePermission(database.db, "granted");
    }
    const scope = smokeScope("display");
    const runtimeSessionId = `manual-mock-screen-burst-${Date.now()}`;
    const helper = new MockScreenCaptureNativeHelper({
      permission: screenPermission("granted"),
      frames: materializeMockRawFrameSidecars(
        makeMockBurstFrames(scope, runtimeSessionId, perception.samplingPolicy.framesPerBurst),
        database.orbitHome
      )
    });
    const schedulerResult = await runScreenBurstScheduler({
      helper,
      perception,
      scope,
      runtimeSessionId,
      trigger: "manual",
      resourceState: readCliPerceptionResourceState(perception),
      protectedApps: perception.protectedApps,
      readPerception: () => readPerceptionStatus(database.db),
      readResourceState: () => readCliPerceptionResourceState(readPerceptionStatus(database.db))
    });
    const burst = schedulerResult.burst;
    const burstObjectId = burst?.id ?? `scheduler_${runtimeSessionId}`;
    for (const entry of schedulerResult.audit) {
      auditRepository.log(entry.operation, "capture_burst", burstObjectId, {
        mode: "manual_mock_screen_burst",
        runtimeSessionId,
        policySnapshotId: perception.policySnapshot.id,
        schedulerStatus: schedulerResult.status,
        reason: entry.reason,
        frameId: entry.frameId,
        frameIndex: entry.frameIndex,
        protectedRuleId: entry.protectedRuleId,
        protectedReason: entry.protectedReason,
        protectedContentDropped: entry.protectedContentDropped
      });
    }

    const frames = burst?.frames.map((candidate) => candidate.frame) ?? [];
    const results: CaptureScreenOcrCommandResult["sources"] = [];
    if (frames.length > 0) {
      const screenPolicy = perception.sources.find(
        (source) => source.sourceKind === "screen"
      )?.policy;
      const ocrPolicy = perception.sources.find((source) => source.sourceKind === "ocr")?.policy;
      const screenAdapter = new ScreenObservationAdapter({
        id: SCREEN_OBSERVATION_ADAPTER_ID,
        frames,
        scope,
        permission: screenPermission("granted"),
        protectedApps: perception.protectedApps,
        allowRawFrameStorage: screenPolicy?.canStoreRaw === true,
        rawRetentionTtlMinutes:
          screenPolicy?.rawRetentionTtlMinutes ?? DEFAULT_RAW_FRAME_TTL_MINUTES,
        canUseForAI: screenPolicy?.canUseForAI === true,
        canExportToAgent: screenPolicy?.canExportToAgent === true
      });
      const ocrAdapter = new OcrObservationAdapter({
        id: OCR_OBSERVATION_ADAPTER_ID,
        frames,
        scope,
        engine: new MockOcrEngine(),
        permission: screenPermission("granted"),
        protectedApps: perception.protectedApps,
        canUseForAI: ocrPolicy?.canUseForAI === true,
        canExportToAgent: ocrPolicy?.canExportToAgent === true
      });

      for (const adapter of [screenAdapter, ocrAdapter]) {
        sourceRepository.upsertFromAdapter(adapter);
        const cursor = sourceRepository.getCursor(adapter.id);
        const result = await ingestEventsFromAdapter(adapter, eventRepository, cursor);
        sourceRepository.setCursor(adapter.id, result.nextCursor);
        sourceRepository.recordSyncSuccess(adapter.id, { lastEventAt: result.lastEventAt });
        for (const entry of result.audit) {
          auditRepository.log(entry.operation, "source", adapter.id, {
            mode: "manual_mock_screen_burst",
            kind: adapter.kind,
            protectedRuleId: entry.protectedRuleId,
            protectedReason: entry.protectedReason,
            protectedContentDropped: entry.protectedContentDropped
          });
        }
        results.push({
          adapterId: result.adapterId,
          read: result.read,
          inserted: result.inserted,
          skipped: result.skipped,
          ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
          warnings: result.warnings
        });
      }
      const lastFrame = frames[frames.length - 1]!;
      eventRepository.upsertEvent(
        normalizeObservationInput(
          {
            type: "observation_state",
            tier: "tier3",
            sourceKind: "screen",
            occurredAt: new Date(new Date(lastFrame.capturedAt).getTime() + 1).toISOString(),
            observedAt: new Date(new Date(lastFrame.capturedAt).getTime() + 1).toISOString(),
            runtimeSessionId,
            sequence: lastFrame.sequence + 10_000
          },
          { adapterId: SCREEN_OBSERVATION_ADAPTER_ID, protectedApps: perception.protectedApps }
        )
      );
    }

    const pipeline = runSemanticPipeline(database, { language: "zh-CN" });
    return {
      orbitHome: database.orbitHome,
      dbPath: database.dbPath,
      mode: "manual_mock_screen_burst",
      sources: results,
      totals: {
        read: results.reduce((total, result) => total + result.read, 0),
        inserted: results.reduce((total, result) => total + result.inserted, 0),
        skipped: results.reduce((total, result) => total + result.skipped, 0)
      },
      warnings: schedulerResult.skipReason ? [schedulerResult.skipReason] : [],
      pipeline,
      burst: {
        id: burst?.id ?? burstObjectId,
        status: schedulerResult.status,
        ...(schedulerResult.skipReason ? { skipReason: schedulerResult.skipReason } : {}),
        frames: (burst?.frames ?? []).map((candidate) => ({
          id: candidate.frame.id,
          frameIndex: candidate.frameIndex,
          capturedAt: candidate.frame.capturedAt,
          frameHash: candidate.frame.frameHash,
          sourcePointer: `screen://burst/${runtimeSessionId}/${burstObjectId}#frame-${candidate.frameIndex}`
        })),
        rawStored: (burst?.frames ?? []).some((candidate) => candidate.rawStored),
        auditOperations: schedulerResult.audit.map((entry) => entry.operation)
      }
    };
  } finally {
    database.close();
  }
}

export function cleanupPerceptionRawSidecars(
  options: {
    dryRun?: boolean;
    confirm?: boolean;
  } = {}
): PerceptionCleanupCommandResult {
  requireConfirmForDestructive("perception cleanup", options);
  const config = getCliConfig();
  const database = openOrbitDatabase({ orbitHome: config.orbitHome });
  try {
    return {
      orbitHome: database.orbitHome,
      dbPath: database.dbPath,
      cleanup: cleanupPerceptionSidecars(database, { dryRun: options.dryRun === true })
    };
  } finally {
    database.close();
  }
}

function requireConfirmForDestructive(
  action: string,
  options: { dryRun?: boolean; confirm?: boolean }
): void {
  if (options.dryRun === true) return;
  if (options.confirm === true) return;
  throw new Error(`${action} modifies local Orbit data. Re-run with --confirm or use --dry-run.`);
}

export function deletePerceptionEvents(options: {
  sourceKind?: string;
  sourceAdapterId?: string;
  from?: string;
  to?: string;
  dryRun?: boolean;
  confirm?: boolean;
}): PerceptionDeleteEventsCommandResult {
  requireConfirmForDestructive("perception delete-events", options);
  const config = getCliConfig();
  const database = openOrbitDatabase({ orbitHome: config.orbitHome });
  try {
    return {
      orbitHome: database.orbitHome,
      dbPath: database.dbPath,
      deletion: deletePerceptionSourceEvents(database, {
        ...(options.sourceKind ? { sourceKind: readPerceptionSourceKind(options.sourceKind) } : {}),
        ...(options.sourceAdapterId ? { sourceAdapterId: options.sourceAdapterId } : {}),
        ...(options.from ? { from: options.from } : {}),
        ...(options.to ? { to: options.to } : {}),
        dryRun: options.dryRun === true
      })
    };
  } finally {
    database.close();
  }
}

export function disablePerceptionSourceAndDeleteRaw(options: {
  sourceKind: string;
  confirm?: boolean;
}): PerceptionDisableSourceDeleteRawCommandResult {
  requireConfirmForDestructive("perception disable-source-delete-raw", options);
  const sourceKind = readPerceptionSourceKind(options.sourceKind);
  const config = getCliConfig();
  const database = openOrbitDatabase({ orbitHome: config.orbitHome });
  try {
    const perception = updatePerceptionSourceRuntime(database.db, sourceKind, "disable");
    const cleanup = cleanupPerceptionSidecars(database, { sourceKind });
    return {
      orbitHome: database.orbitHome,
      dbPath: database.dbPath,
      perception,
      cleanup
    };
  } finally {
    database.close();
  }
}

export function getPerceptionReleaseGate(): PerceptionReleaseGateCommandResult {
  const config = getCliConfig();
  const database = openOrbitDatabase({ orbitHome: config.orbitHome });
  try {
    const cleanup = cleanupPerceptionSidecars(database, { dryRun: true });
    const operations = new AuditRepository(database.db).listAuditLogs().map((log) => log.operation);
    return {
      orbitHome: database.orbitHome,
      dbPath: database.dbPath,
      releaseGate: evaluatePerceptionReleaseGate({
        perception: readPerceptionStatus(database.db),
        auditOperations: operations,
        cleanup,
        packaging: {
          excludesTmp: true,
          excludesFixtures: true,
          privateDataScan: scanPackagedPrivateData(join(dirname(config.fixturesRoot), "apps/desktop")),
          nativeHelperMode: readPackagedNativeHelperMode(),
          signed: false,
          notarized: false
        },
        manualSmoke: readManualSmokeStatusFromEnv()
      })
    };
  } finally {
    database.close();
  }
}

function readPackagedNativeHelperMode(): "none" | "mock" | "unsigned" | "signed" {
  const value = process.env.ORBIT_PACKAGED_NATIVE_HELPER_MODE;
  if (value === "none" || value === "mock" || value === "unsigned" || value === "signed") {
    return value;
  }
  return "unsigned";
}

function readManualSmokeStatusFromEnv(): Partial<Record<ManualSmokeScenario, ManualSmokeStatus>> {
  const raw = process.env.ORBIT_ALPHA_MANUAL_SMOKE?.trim();
  if (!raw) return {};
  const result: Partial<Record<ManualSmokeScenario, ManualSmokeStatus>> = {};
  for (const entry of raw.split(",")) {
    const [scenario, status] = entry.split("=").map((item) => item?.trim());
    if (isManualSmokeScenario(scenario) && isManualSmokeStatus(status)) {
      result[scenario] = status;
    }
  }
  return result;
}

function isManualSmokeScenario(value: string | undefined): value is ManualSmokeScenario {
  return (
    value === "screenRecordingPermission" ||
    value === "autoStart" ||
    value === "pauseResumeStop" ||
    value === "permissionRevoke" ||
    value === "restartAutoResume" ||
    value === "resourcePause" ||
    value === "protectedContext" ||
    value === "auditReview" ||
    value === "cleanup" ||
    value === "handoffExclusion"
  );
}

function isManualSmokeStatus(value: string | undefined): value is ManualSmokeStatus {
  return value === "passed" || value === "failed" || value === "needs_data";
}

function scanPackagedPrivateData(root: string): { scanned: number; violations: string[] } {
  const releaseRoot = join(root, "release");
  if (!existsSync(releaseRoot)) return { scanned: 0, violations: [] };
  const violations: string[] = [];
  let scanned = 0;
  const stack = [releaseRoot];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const stat = statSync(current);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(current)) {
        stack.push(join(current, entry));
      }
      continue;
    }
    scanned += 1;
    if (/(?:fixtures|perception-sidecars|\.tmp)(?:\/|$)/.test(current)) {
      violations.push(current.replace(root, ""));
      continue;
    }
    if (stat.size <= 1024 * 1024 && /\.(?:json|jsonl|txt|md|log|env)$/i.test(current)) {
      const text = readFileSync(current, "utf8");
      if (/hunter2|sk-test|person@example\.com|RAW_OCR_TEXT|RAW_EVENT_TEXT/.test(text)) {
        violations.push(current.replace(root, ""));
      }
    }
  }
  return { scanned, violations };
}

export async function transcribeAudioFixture(): Promise<TranscribeFixtureCommandResult> {
  const config = getCliConfig();
  const database = openOrbitDatabase({ orbitHome: config.orbitHome });
  try {
    const sourceRepository = new SourceRepository(database.db);
    const eventRepository = new EventRepository(database.db);
    const auditRepository = new AuditRepository(database.db);
    const perception = readPerceptionStatus(database.db);
    const audioRead = readAudioFixtures(join(config.fixturesRoot, "perception/audio"));
    const audioScope = audioRead.segments[0]?.scope ?? {
      kind: "microphone" as const,
      label: "Goal 9B transcription fixture",
      deviceId: "fixture-mic"
    };
    const providerBuild = buildCliTranscriptionProvider(perception);
    const adapter = new TranscriptObservationAdapter({
      id: TRANSCRIPT_OBSERVATION_ADAPTER_ID,
      segments: audioRead.segments,
      scope: audioScope,
      provider: providerBuild.provider,
      policy: transcriptPolicyFromPerceptionStatus(perception),
      permission: audioPermission("microphone", "granted"),
      protectedApps: perception.protectedApps
    });
    sourceRepository.upsertFromAdapter(adapter);
    const cursor = sourceRepository.getCursor(adapter.id);
    const result = await ingestEventsFromAdapter(adapter, eventRepository, cursor);
    sourceRepository.setCursor(adapter.id, result.nextCursor);
    sourceRepository.recordSyncSuccess(adapter.id, { lastEventAt: result.lastEventAt });
    const warnings = [...audioRead.warnings, ...providerBuild.warnings, ...result.warnings];
    auditRepository.log("perception.transcription_fixture", "source", adapter.id, {
      mode: "explicit_fixture_transcription",
      provider: providerBuild.provider.kind,
      read: result.read,
      inserted: result.inserted,
      skipped: result.skipped,
      warnings
    });
    const pipeline = runSemanticPipeline(database);
    return {
      orbitHome: database.orbitHome,
      dbPath: database.dbPath,
      source: {
        adapterId: result.adapterId,
        read: result.read,
        inserted: result.inserted,
        skipped: result.skipped,
        ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
        warnings
      },
      pipeline
    };
  } finally {
    database.close();
  }
}

export async function summarizeVisionFixture(): Promise<VisionFixtureCommandResult> {
  const config = getCliConfig();
  const database = openOrbitDatabase({ orbitHome: config.orbitHome });
  try {
    const sourceRepository = new SourceRepository(database.db);
    const eventRepository = new EventRepository(database.db);
    const auditRepository = new AuditRepository(database.db);
    const perception = readPerceptionStatus(database.db);
    const fixtureRead = readScreenCaptureFixtures(
      join(config.fixturesRoot, "perception/screen-ocr")
    );
    const scope = fixtureRead.frames[0]?.scope ?? smokeScope("display");
    const screenAdapters = [
      new ScreenObservationAdapter({
        id: SCREEN_OBSERVATION_ADAPTER_ID,
        frames: fixtureRead.frames,
        scope,
        permission: screenPermission("granted"),
        protectedApps: perception.protectedApps,
        allowRawFrameStorage: false,
        canUseForAI:
          perception.sources.find((source) => source.sourceKind === "screen")?.policy
            .canUseForAI === true,
        canExportToAgent:
          perception.sources.find((source) => source.sourceKind === "screen")?.policy
            .canExportToAgent === true
      }),
      new OcrObservationAdapter({
        id: OCR_OBSERVATION_ADAPTER_ID,
        frames: fixtureRead.frames,
        scope,
        engine: new MockOcrEngine(),
        permission: screenPermission("granted"),
        protectedApps: perception.protectedApps,
        canUseForAI:
          perception.sources.find((source) => source.sourceKind === "ocr")?.policy.canUseForAI ===
          true,
        canExportToAgent:
          perception.sources.find((source) => source.sourceKind === "ocr")?.policy
            .canExportToAgent === true
      })
    ];
    const results: VisionFixtureCommandResult["sources"] = [];
    for (const adapter of screenAdapters) {
      sourceRepository.upsertFromAdapter(adapter);
      const cursor = sourceRepository.getCursor(adapter.id);
      const result = await ingestEventsFromAdapter(adapter, eventRepository, cursor);
      sourceRepository.setCursor(adapter.id, result.nextCursor);
      sourceRepository.recordSyncSuccess(adapter.id, { lastEventAt: result.lastEventAt });
      const warnings = [...fixtureRead.warnings, ...result.warnings];
      results.push({
        adapterId: result.adapterId,
        read: result.read,
        inserted: result.inserted,
        skipped: result.skipped,
        ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
        warnings
      });
    }

    const providerBuild = buildCliVisionProvider(perception);
    const allEvents = eventRepository.listEvents();
    const visionAdapter = new VisionSummaryAdapter({
      id: VISION_SUMMARY_ADAPTER_ID,
      screenEvents: allEvents.filter(
        (event) => event.source.adapterId === SCREEN_OBSERVATION_ADAPTER_ID
      ),
      ocrEvents: allEvents.filter((event) => event.source.adapterId === OCR_OBSERVATION_ADAPTER_ID),
      provider: providerBuild.provider,
      policy: visionPolicyFromPerceptionStatus(perception)
    });
    sourceRepository.upsertFromAdapter(visionAdapter);
    const cursor = sourceRepository.getCursor(visionAdapter.id);
    const result = await ingestEventsFromAdapter(visionAdapter, eventRepository, cursor);
    sourceRepository.setCursor(visionAdapter.id, result.nextCursor);
    sourceRepository.recordSyncSuccess(visionAdapter.id, { lastEventAt: result.lastEventAt });
    const visionWarnings = [...providerBuild.warnings, ...result.warnings];
    auditRepository.log("perception.vision_fixture", "source", visionAdapter.id, {
      mode: "explicit_fixture_vision",
      provider: providerBuild.provider.kind,
      read: result.read,
      inserted: result.inserted,
      skipped: result.skipped,
      warnings: visionWarnings
    });
    results.push({
      adapterId: result.adapterId,
      read: result.read,
      inserted: result.inserted,
      skipped: result.skipped,
      ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
      warnings: visionWarnings
    });

    const pipeline = runSemanticPipeline(database);
    return {
      orbitHome: database.orbitHome,
      dbPath: database.dbPath,
      sources: results,
      pipeline
    };
  } finally {
    database.close();
  }
}

function buildCliTranscriptionProvider(perception: PerceptionControlPlaneStatus): {
  provider: ReturnType<typeof buildTranscriptionProvider>;
  warnings: string[];
} {
  const route = perception.providerRoutes.find((item) => item.task === "transcription");
  const aiConfig = readAIProviderConfigFromEnv();
  try {
    return {
      provider: buildTranscriptionProvider({
        kind: route?.provider ?? "disabled",
        ...(aiConfig.baseUrl ? { baseUrl: aiConfig.baseUrl } : {}),
        ...((process.env.ORBIT_OPENAI_TRANSCRIPTION_MODEL ?? aiConfig.model)
          ? { model: process.env.ORBIT_OPENAI_TRANSCRIPTION_MODEL ?? aiConfig.model }
          : {}),
        ...(aiConfig.apiKey ? { apiKey: aiConfig.apiKey } : {}),
        ...(aiConfig.timeoutMs ? { timeoutMs: aiConfig.timeoutMs } : {})
      }),
      warnings: []
    };
  } catch (error) {
    return {
      provider: disabledTranscriptionProvider,
      warnings: [error instanceof Error ? error.message : String(error)]
    };
  }
}

function buildCliVisionProvider(perception: PerceptionControlPlaneStatus): {
  provider: VisionProvider;
  warnings: string[];
} {
  const route = perception.providerRoutes.find((item) => item.task === "vision");
  const aiConfig = readAIProviderConfigFromEnv();
  try {
    if (route?.provider === "mock") return { provider: mockVisionProvider, warnings: [] };
    if (route?.provider === "openai-compatible") {
      if (!aiConfig.baseUrl?.trim()) {
        throw new Error("OpenAI-compatible vision provider requires a base URL.");
      }
      if (!aiConfig.model?.trim()) {
        throw new Error("OpenAI-compatible vision provider requires a model.");
      }
      return {
        provider: createOpenAICompatibleVisionProvider({
          baseUrl: aiConfig.baseUrl,
          model: aiConfig.model,
          ...(aiConfig.apiKey ? { apiKey: aiConfig.apiKey } : {}),
          ...(aiConfig.timeoutMs ? { timeoutMs: aiConfig.timeoutMs } : {}),
          ...(aiConfig.maxTokens ? { maxTokens: aiConfig.maxTokens } : {})
        }),
        warnings: []
      };
    }
    return { provider: disabledVisionProvider, warnings: [] };
  } catch (error) {
    return {
      provider: disabledVisionProvider,
      warnings: [error instanceof Error ? error.message : String(error)]
    };
  }
}

function readCliPerceptionResourceState(
  perception: PerceptionControlPlaneStatus
): PerceptionResourceState {
  return evaluatePerceptionResourceState(perception.resourcePolicy, {
    lowPowerMode: false,
    batteryPercent: null,
    rawSidecarBytes: 0,
    queueDepth: 0,
    providerRequestsLastHour: 0,
    providerInputCharsPending: 0,
    providerTokensLastHour: 0
  });
}

function smokeScope(kind: ScreenCaptureScope["kind"]): ScreenCaptureScope {
  if (kind === "app") {
    return {
      kind,
      label: "Orbit",
      appName: "Orbit",
      appBundleId: "app.orbit.local"
    };
  }
  if (kind === "window") {
    return {
      kind,
      label: "Orbit Screen/OCR Smoke",
      windowId: "orbit-smoke-window"
    };
  }
  if (kind === "region") {
    return {
      kind,
      label: "Orbit Smoke Region",
      region: {
        x: 0,
        y: 0,
        width: 800,
        height: 600
      }
    };
  }
  return {
    kind: "display",
    label: "Fixture Display",
    displayId: "fixture-display"
  };
}

function makeMockBurstFrames(
  scope: ScreenCaptureScope,
  runtimeSessionId: string,
  count: number
): ScreenCaptureFrame[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `mock_burst_frame_${index + 1}`,
    capturedAt: new Date(Date.UTC(2026, 4, 21, 2, 0, index)).toISOString(),
    runtimeSessionId,
    sequence: index + 1,
    scope,
    app: {
      name: "Orbit",
      bundleId: "app.orbit.local"
    },
    window: {
      title: "Orbit Screen/OCR Burst"
    },
    width: 1280,
    height: 720,
    frameHash: `mock_burst_frame_hash_${index + 1}`,
    redactedSummary: `Mock Screen/OCR burst frame ${index + 1}.`,
    ocrText: `Mock Screen/OCR burst frame ${index + 1} 支持中文 and English.`
  }));
}

function materializeMockRawFrameSidecars(
  frames: ScreenCaptureFrame[],
  orbitHome: string
): ScreenCaptureFrame[] {
  const sidecarRoot = join(orbitHome, "perception-sidecars");
  mkdirSync(sidecarRoot, { recursive: true });
  return frames.map((frame) => {
    const path = join(sidecarRoot, `${frame.frameHash}.mock-frame.txt`);
    const bytes = Buffer.from(
      JSON.stringify(
        {
          id: frame.id,
          frameHash: frame.frameHash,
          capturedAt: frame.capturedAt,
          redactedSummary: frame.redactedSummary
        },
        null,
        2
      )
    );
    writeFileSync(path, bytes);
    return {
      ...frame,
      rawLocalRef: path,
      sizeBytes: bytes.byteLength
    };
  });
}

function readSamplingPreset(value: string): PerceptionSamplingPresetName {
  if (value === "conservative" || value === "balanced" || value === "intensive") return value;
  throw new Error(`Unsupported perception sampling preset: ${value}`);
}

function readPerceptionPermissionStatus(value: string): PerceptionPermissionStatus {
  if (
    value === "not_required" ||
    value === "not_determined" ||
    value === "granted" ||
    value === "denied" ||
    value === "restricted" ||
    value === "unknown"
  ) {
    return value;
  }
  throw new Error(`Unsupported Screen Recording permission status: ${value}`);
}
