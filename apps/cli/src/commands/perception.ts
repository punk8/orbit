import {
  audioPermission,
  MockScreenCaptureNativeHelper,
  readAudioFixtures,
  ScreenObservationSession,
  type ScreenCaptureScope,
  screenPermission,
  TRANSCRIPT_OBSERVATION_ADAPTER_ID,
  TranscriptObservationAdapter,
  transcriptPolicyFromPerceptionStatus
} from "@orbit/adapters";
import {
  buildTranscriptionProvider,
  disabledTranscriptionProvider,
  readAIProviderConfigFromEnv
} from "@orbit/ai";
import { ingestEventsFromAdapter } from "@orbit/core";
import {
  AuditRepository,
  cleanupPerceptionSidecars,
  EventRepository,
  openOrbitDatabase,
  readPerceptionProviderKind,
  readPerceptionProviderTask,
  readPerceptionSourceKind,
  readPerceptionStatus,
  SourceRepository,
  updatePerceptionProviderRoute,
  updatePerceptionSourcePolicy
} from "@orbit/db";
import { evaluatePerceptionReleaseGate } from "@orbit/privacy";
import { getCliConfig } from "../config";
import { runSemanticPipeline, type SemanticPipelineResult } from "./semanticPipeline";
import { join } from "node:path";
import type { PerceptionControlPlaneStatus, PerceptionSourcePolicyPatch } from "@orbit/core";

export interface PerceptionStatusResult {
  orbitHome: string;
  dbPath: string;
  perception: PerceptionControlPlaneStatus;
}

export interface UpdatePerceptionPolicyInput {
  sourceKind: string;
  patch: PerceptionSourcePolicyPatch;
}

export interface UpdatePerceptionProviderRouteInput {
  task: string;
  provider: string;
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

export interface PerceptionCleanupCommandResult {
  orbitHome: string;
  dbPath: string;
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

export function setPerceptionSourcePolicy(
  input: UpdatePerceptionPolicyInput
): PerceptionStatusResult {
  const config = getCliConfig();
  const database = openOrbitDatabase({ orbitHome: config.orbitHome });
  try {
    const sourceKind = readPerceptionSourceKind(input.sourceKind);
    const perception = updatePerceptionSourcePolicy(database.db, sourceKind, input.patch);
    if (input.patch.canStoreRaw === false || input.patch.rawRetentionTtlMinutes === null) {
      cleanupPerceptionSidecars(database, { sourceKind });
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

export function cleanupPerceptionRawSidecars(
  options: {
    dryRun?: boolean;
  } = {}
): PerceptionCleanupCommandResult {
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
          nativeHelperMode: "mock",
          signed: false,
          notarized: false
        }
      })
    };
  } finally {
    database.close();
  }
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
