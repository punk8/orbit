import { join } from "node:path";
import {
  AUDIO_OBSERVATION_ADAPTER_ID,
  AudioObservationAdapter,
  audioPermission,
  MockOcrEngine,
  OcrObservationAdapter,
  OCR_OBSERVATION_ADAPTER_ID,
  readAudioFixtures,
  readScreenCaptureFixtures,
  ScreenObservationAdapter,
  SCREEN_OBSERVATION_ADAPTER_ID,
  type ScreenCaptureScope,
  screenPermission,
  TRANSCRIPT_OBSERVATION_ADAPTER_ID,
  TranscriptObservationAdapter,
  transcriptPolicyFromPerceptionStatus,
  VisionSummaryAdapter,
  VISION_SUMMARY_ADAPTER_ID,
  visionPolicyFromPerceptionStatus
} from "@orbit/adapters";
import { mockTranscriptionProvider, mockVisionProvider } from "@orbit/ai";
import {
  defaultProtectedAppRules,
  ingestEventsFromAdapter,
  type ObservationStatus,
  type PerceptionControlPlaneStatus,
  type PerceptionSourceKind
} from "@orbit/core";
import {
  AuditRepository,
  EventRepository,
  openOrbitDatabase,
  readPerceptionStatus,
  SettingsRepository,
  SourceRepository
} from "@orbit/db";
import { getCliConfig } from "../config";
import { runSemanticPipeline, type SemanticPipelineResult } from "./semanticPipeline";

export interface IngestPerceptionFixturesResult {
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
  totals: {
    read: number;
    inserted: number;
    skipped: number;
  };
  pipeline: SemanticPipelineResult;
}

export interface IngestPerceptionFixturesOptions {
  includeVision?: boolean;
  includeAudio?: boolean;
}

export async function ingestPerceptionFixtures(
  options: IngestPerceptionFixturesOptions = {}
): Promise<IngestPerceptionFixturesResult> {
  const config = getCliConfig();
  const database = openOrbitDatabase({ orbitHome: config.orbitHome });
  try {
    const settingsRepository = new SettingsRepository(database.db);
    const sourceRepository = new SourceRepository(database.db);
    const eventRepository = new EventRepository(database.db);
    const auditRepository = new AuditRepository(database.db);
    const protectedApps =
      settingsRepository.get<ObservationStatus["protectedApps"]>("observation.protectedApps") ??
      defaultProtectedAppRules();
    const perceptionStatus = readPerceptionStatus(database.db);
    const screenPolicy = perceptionSourcePolicy(perceptionStatus, "screen");
    const ocrPolicy = perceptionSourcePolicy(perceptionStatus, "ocr");
    const fixtureRead = readScreenCaptureFixtures(
      join(config.fixturesRoot, "perception/screen-ocr")
    );
    const scope = fixtureRead.frames[0]?.scope ?? defaultFixtureScope;
    const permission = screenPermission("granted");
    const adapters = [
      new ScreenObservationAdapter({
        id: SCREEN_OBSERVATION_ADAPTER_ID,
        frames: fixtureRead.frames,
        scope,
        permission,
        protectedApps,
        allowRawFrameStorage: screenPolicy.policy.canStoreRaw,
        canUseForAI: screenPolicy.policy.canUseForAI,
        canExportToAgent: screenPolicy.policy.canExportToAgent
      }),
      new OcrObservationAdapter({
        id: OCR_OBSERVATION_ADAPTER_ID,
        frames: fixtureRead.frames,
        scope,
        engine: new MockOcrEngine(),
        permission,
        protectedApps,
        canUseForAI: ocrPolicy.policy.canUseForAI,
        canExportToAgent: ocrPolicy.policy.canExportToAgent
      })
    ];

    const results = [];
    for (const adapter of adapters) {
      sourceRepository.upsertFromAdapter(adapter);
      const cursor = sourceRepository.getCursor(adapter.id);
      const result = await ingestEventsFromAdapter(adapter, eventRepository, cursor);
      sourceRepository.setCursor(adapter.id, result.nextCursor);
      sourceRepository.recordSyncSuccess(adapter.id, { lastEventAt: result.lastEventAt });
      const warnings = [...fixtureRead.warnings, ...result.warnings];
      auditRepository.log("perception.fixture_ingest", "source", adapter.id, {
        mode: "explicit_fixture_import",
        kind: adapter.kind,
        read: result.read,
        inserted: result.inserted,
        skipped: result.skipped,
        warnings
      });
      results.push({
        adapterId: result.adapterId,
        read: result.read,
        inserted: result.inserted,
        skipped: result.skipped,
        ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
        warnings
      });
    }

    if (options.includeVision) {
      const allEvents = eventRepository.listEvents();
      const visionAdapter = new VisionSummaryAdapter({
        id: VISION_SUMMARY_ADAPTER_ID,
        screenEvents: allEvents.filter(
          (event) => event.source.adapterId === SCREEN_OBSERVATION_ADAPTER_ID
        ),
        ocrEvents: allEvents.filter(
          (event) => event.source.adapterId === OCR_OBSERVATION_ADAPTER_ID
        ),
        provider: mockVisionProvider,
        policy: visionPolicyFromPerceptionStatus(perceptionStatus)
      });
      sourceRepository.upsertFromAdapter(visionAdapter);
      const cursor = sourceRepository.getCursor(visionAdapter.id);
      const result = await ingestEventsFromAdapter(visionAdapter, eventRepository, cursor);
      sourceRepository.setCursor(visionAdapter.id, result.nextCursor);
      sourceRepository.recordSyncSuccess(visionAdapter.id, { lastEventAt: result.lastEventAt });
      auditRepository.log("perception.vision_fixture_ingest", "source", visionAdapter.id, {
        mode: "explicit_fixture_import",
        provider: "mock",
        read: result.read,
        inserted: result.inserted,
        skipped: result.skipped,
        warnings: result.warnings
      });
      results.push({
        adapterId: result.adapterId,
        read: result.read,
        inserted: result.inserted,
        skipped: result.skipped,
        ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
        warnings: result.warnings
      });
    }

    if (options.includeAudio) {
      const audioRead = readAudioFixtures(join(config.fixturesRoot, "perception/audio"));
      const audioScope = audioRead.segments[0]?.scope ?? defaultAudioFixtureScope;
      const permission = audioPermission("microphone", "granted");
      const audioPolicy = perceptionSourcePolicy(perceptionStatus, "microphone_audio");
      const audioAdapters = [
        new AudioObservationAdapter({
          id: AUDIO_OBSERVATION_ADAPTER_ID,
          segments: audioRead.segments,
          scope: audioScope,
          permission,
          protectedApps,
          canUseForAI: audioPolicy.policy.canUseForAI,
          canExportToAgent: audioPolicy.policy.canExportToAgent
        }),
        new TranscriptObservationAdapter({
          id: TRANSCRIPT_OBSERVATION_ADAPTER_ID,
          segments: audioRead.segments,
          scope: audioScope,
          provider: mockTranscriptionProvider,
          policy: transcriptPolicyFromPerceptionStatus(perceptionStatus),
          permission,
          protectedApps
        })
      ];
      for (const adapter of audioAdapters) {
        sourceRepository.upsertFromAdapter(adapter);
        const cursor = sourceRepository.getCursor(adapter.id);
        const result = await ingestEventsFromAdapter(adapter, eventRepository, cursor);
        sourceRepository.setCursor(adapter.id, result.nextCursor);
        sourceRepository.recordSyncSuccess(adapter.id, { lastEventAt: result.lastEventAt });
        const warnings = [...audioRead.warnings, ...result.warnings];
        auditRepository.log("perception.audio_fixture_ingest", "source", adapter.id, {
          mode: "explicit_fixture_import",
          read: result.read,
          inserted: result.inserted,
          skipped: result.skipped,
          warnings
        });
        results.push({
          adapterId: result.adapterId,
          read: result.read,
          inserted: result.inserted,
          skipped: result.skipped,
          ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
          warnings
        });
      }
    }

    const pipeline = runSemanticPipeline(database);

    return {
      orbitHome: database.orbitHome,
      dbPath: database.dbPath,
      sources: results,
      totals: {
        read: results.reduce((total, result) => total + result.read, 0),
        inserted: results.reduce((total, result) => total + result.inserted, 0),
        skipped: results.reduce((total, result) => total + result.skipped, 0)
      },
      pipeline
    };
  } finally {
    database.close();
  }
}

const defaultFixtureScope: ScreenCaptureScope = {
  kind: "display",
  label: "Fixture Display",
  displayId: "fixture-display"
};

const defaultAudioFixtureScope = {
  kind: "microphone" as const,
  label: "Goal 8D mock meeting",
  deviceId: "fixture-mic"
};

function perceptionSourcePolicy(
  status: PerceptionControlPlaneStatus,
  sourceKind: PerceptionSourceKind
): PerceptionControlPlaneStatus["sources"][number] {
  const source = status.sources.find((item) => item.sourceKind === sourceKind);
  if (!source) throw new Error(`Unknown perception source: ${sourceKind}`);
  return source;
}
