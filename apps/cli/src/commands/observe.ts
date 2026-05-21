import { join } from "node:path";
import {
  DESKTOP_OBSERVATION_ADAPTER_ID,
  createDefaultObservationStatus,
  defaultProtectedAppRules,
  type ObservationRuntimeStatus,
  type ObservationStatus
} from "@orbit/core";
import {
  DesktopObservationAdapter,
  InProcessObservationQueue,
  MockDesktopObservationSource
} from "@orbit/adapters";
import {
  AuditRepository,
  EventRepository,
  openOrbitDatabase,
  SettingsRepository,
  SourceRepository
} from "@orbit/db";
import { getCliConfig } from "../config";
import { runSemanticPipeline, type SemanticPipelineResult } from "./semanticPipeline";

export interface ObserveStatusResult {
  orbitHome: string;
  dbPath: string;
  observation: ObservationStatus;
}

export interface IngestMockObservationResult {
  orbitHome: string;
  dbPath: string;
  source: {
    adapterId: string;
    read: number;
    emitted: number;
    inserted: number;
    skipped: number;
    dropped: number;
    nextCursor: string;
    warnings: string[];
    lastEventAt?: string;
  };
  pipeline: SemanticPipelineResult;
}

export function getObserveStatus(): ObserveStatusResult {
  const config = getCliConfig();
  const database = openOrbitDatabase({ orbitHome: config.orbitHome });
  try {
    return {
      orbitHome: database.orbitHome,
      dbPath: database.dbPath,
      observation: readObservationStatus(new SettingsRepository(database.db), 0)
    };
  } finally {
    database.close();
  }
}

export async function ingestMockDesktopObservations(): Promise<IngestMockObservationResult> {
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
    const adapter = new DesktopObservationAdapter({
      inputs: [],
      id: DESKTOP_OBSERVATION_ADAPTER_ID,
      protectedApps
    });
    sourceRepository.upsertFromAdapter(adapter);

    const paused = settingsRepository.get<boolean>("observation.paused") ?? false;
    const source = MockDesktopObservationSource.fromDirectory(join(config.fixturesRoot, "desktop"));
    const queue = new InProcessObservationQueue({
      adapterId: DESKTOP_OBSERVATION_ADAPTER_ID,
      protectedApps
    });
    if (paused) queue.pause();

    const cursor = sourceRepository.getCursor(DESKTOP_OBSERVATION_ADAPTER_ID);
    const emit = source.emitToQueue(queue, cursor);
    const drain = await queue.drain(eventRepository);
    if (!paused) {
      sourceRepository.setCursor(DESKTOP_OBSERVATION_ADAPTER_ID, emit.nextCursor);
      sourceRepository.recordSyncSuccess(DESKTOP_OBSERVATION_ADAPTER_ID, {
        lastEventAt: drain.lastEventAt
      });
    }
    writeObservationStatus(settingsRepository, {
      status: paused ? "paused" : "ready",
      enabled: true,
      paused,
      queueDepth: queue.depth,
      protectedApps,
      ...(drain.lastEventAt ? { lastEventAt: drain.lastEventAt } : {})
    });
    auditRepository.log("observation.mock_ingest", "source", DESKTOP_OBSERVATION_ADAPTER_ID, {
      read: emit.read,
      emitted: emit.emitted,
      inserted: drain.inserted,
      skipped: drain.skipped,
      dropped: drain.dropped,
      warnings: [...emit.warnings, ...drain.warnings]
    });

    const pipeline = runSemanticPipeline(database);
    const sourceResult: IngestMockObservationResult["source"] = {
      adapterId: DESKTOP_OBSERVATION_ADAPTER_ID,
      read: emit.read,
      emitted: emit.emitted,
      inserted: drain.inserted,
      skipped: drain.skipped,
      dropped: drain.dropped,
      nextCursor: emit.nextCursor,
      warnings: [...emit.warnings, ...drain.warnings]
    };
    if (drain.lastEventAt) sourceResult.lastEventAt = drain.lastEventAt;
    return {
      orbitHome: database.orbitHome,
      dbPath: database.dbPath,
      source: sourceResult,
      pipeline
    };
  } finally {
    database.close();
  }
}

function readObservationStatus(
  settingsRepository: SettingsRepository,
  queueDepth: number
): ObservationStatus {
  const runtimeStatus =
    settingsRepository.get<ObservationRuntimeStatus>("observation.status") ?? "not_configured";
  const enabled = settingsRepository.get<boolean>("observation.enabled") ?? false;
  const paused = settingsRepository.get<boolean>("observation.paused") ?? false;
  const overrides: Partial<ObservationStatus> = {
    status: runtimeStatus,
    enabled,
    paused,
    protectedApps:
      settingsRepository.get<ObservationStatus["protectedApps"]>("observation.protectedApps") ??
      defaultProtectedAppRules(),
    allowedFolders:
      settingsRepository.get<ObservationStatus["allowedFolders"]>("observation.allowedFolders") ??
      [],
    queueDepth
  };
  const lastStartedAt = settingsRepository.get<string>("observation.lastStartedAt");
  const lastStoppedAt = settingsRepository.get<string>("observation.lastStoppedAt");
  const lastEventAt = settingsRepository.get<string>("observation.lastEventAt");
  const lastError = settingsRepository.get<string>("observation.lastError");
  if (lastStartedAt) overrides.lastStartedAt = lastStartedAt;
  if (lastStoppedAt) overrides.lastStoppedAt = lastStoppedAt;
  if (lastEventAt) overrides.lastEventAt = lastEventAt;
  if (lastError) overrides.lastError = lastError;
  if (enabled) {
    overrides.tiers = {
      tier1: {
        enabled: true,
        status: paused ? "paused" : runtimeStatus,
        sourceKinds: ["desktop"],
        ...(lastEventAt ? { lastEventAt } : {})
      },
      tier2: {
        enabled: false,
        status: "disabled",
        sourceKinds: ["accessibility", "browser", "terminal", "clipboard", "filesystem"]
      },
      tier3: {
        enabled: false,
        status: "disabled",
        sourceKinds: ["screen", "ocr", "audio", "transcript"]
      }
    };
  }
  return createDefaultObservationStatus(overrides);
}

function writeObservationStatus(
  settingsRepository: SettingsRepository,
  input: {
    status: ObservationRuntimeStatus;
    enabled: boolean;
    paused: boolean;
    lastEventAt?: string;
    queueDepth: number;
    protectedApps: ObservationStatus["protectedApps"];
  }
): void {
  settingsRepository.set("observation.status", input.status);
  settingsRepository.set("observation.enabled", input.enabled);
  settingsRepository.set("observation.paused", input.paused);
  settingsRepository.set("observation.protectedApps", input.protectedApps);
  if (input.lastEventAt) settingsRepository.set("observation.lastEventAt", input.lastEventAt);
}
