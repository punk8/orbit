import { join } from "node:path";
import {
  DESKTOP_OBSERVATION_ADAPTER_ID,
  createDefaultObservationStatus,
  type AllowedFolderRule,
  type ObservationPermissionStatus,
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
  readProtectedAppRules,
  SettingsRepository,
  SourceRepository
} from "@orbit/db";
import { upsertProtectedAppRule, type ProtectedRuleInput } from "@orbit/db";
import { getCliConfig } from "../config";
import { runSemanticPipeline, type SemanticPipelineResult } from "./semanticPipeline";

export interface ObserveStatusResult {
  orbitHome: string;
  dbPath: string;
  observation: ObservationStatus;
}

export interface ObservePermissionsResult {
  orbitHome: string;
  dbPath: string;
  permissions: ObservationPermissionStatus[];
}

export interface ObserveProtectedAppsResult {
  orbitHome: string;
  dbPath: string;
  protectedApps: ObservationStatus["protectedApps"];
}

export interface UpsertObserveProtectedRuleResult {
  orbitHome: string;
  dbPath: string;
  protectedApps: ObservationStatus["protectedApps"];
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

export function getObservePermissions(): ObservePermissionsResult {
  const status = getObserveStatus();
  return {
    orbitHome: status.orbitHome,
    dbPath: status.dbPath,
    permissions: status.observation.permissions
  };
}

export function getObserveProtectedApps(): ObserveProtectedAppsResult {
  const status = getObserveStatus();
  return {
    orbitHome: status.orbitHome,
    dbPath: status.dbPath,
    protectedApps: status.observation.protectedApps
  };
}

export function upsertObserveProtectedRule(
  input: ProtectedRuleInput
): UpsertObserveProtectedRuleResult {
  const config = getCliConfig();
  const database = openOrbitDatabase({ orbitHome: config.orbitHome });
  try {
    const perception = upsertProtectedAppRule(database.db, input);
    return {
      orbitHome: database.orbitHome,
      dbPath: database.dbPath,
      protectedApps: perception.protectedApps
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
    const protectedApps = readProtectedAppRules(settingsRepository);
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
  const allowedFolders =
    settingsRepository.get<ObservationStatus["allowedFolders"]>("observation.allowedFolders") ??
    [];
  const tier2 = readTier2Status(settingsRepository, allowedFolders);
  const status = enabled ? runtimeStatus : tier2.enabled ? tier2.status : runtimeStatus;
  const overrides: Partial<ObservationStatus> = {
    status,
    enabled,
    paused,
    protectedApps: readProtectedAppRules(settingsRepository),
    allowedFolders,
    permissions: tier2.permissions,
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
  if (enabled || tier2.enabled) {
    overrides.tiers = {
      tier1: {
        enabled,
        status: enabled ? (paused ? "paused" : runtimeStatus) : "not_configured",
        sourceKinds: ["desktop"],
        ...(lastEventAt ? { lastEventAt } : {})
      },
      tier2: {
        enabled: tier2.enabled,
        status: tier2.status,
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

function readTier2Status(
  settingsRepository: SettingsRepository,
  allowedFolders: AllowedFolderRule[]
): {
  enabled: boolean;
  status: ObservationRuntimeStatus;
  permissions: ObservationPermissionStatus[];
} {
  const accessibilityEnabled =
    settingsRepository.get<boolean>("observation.accessibility.enabled") ?? false;
  const browserEnabled = settingsRepository.get<boolean>("observation.browser.enabled") ?? false;
  const filesystemEnabled =
    settingsRepository.get<boolean>("observation.filesystem.enabled") ?? false;
  const clipboardEnabled =
    settingsRepository.get<boolean>("observation.clipboard.enabled") ?? false;
  const terminalEnabled = settingsRepository.get<boolean>("observation.terminal.enabled") ?? false;
  const enabled =
    accessibilityEnabled ||
    browserEnabled ||
    filesystemEnabled ||
    clipboardEnabled ||
    terminalEnabled;
  const accessibilityStatus = readPermissionStatus(
    settingsRepository,
    "observation.permission.accessibility",
    accessibilityEnabled || browserEnabled
  );
  const filesystemStatus: ObservationPermissionStatus["status"] =
    filesystemEnabled && allowedFolders.some((folder) => folder.enabled)
      ? "granted"
      : readPermissionStatus(
          settingsRepository,
          "observation.permission.filesystem",
          filesystemEnabled
        );
  const automationStatus = readPermissionStatus(
    settingsRepository,
    "observation.permission.automation",
    terminalEnabled
  );
  const permissions: ObservationPermissionStatus[] = [
    {
      kind: "accessibility",
      requiredFor: ["accessibility", "browser"],
      status: accessibilityStatus,
      canRequestFromApp: false
    },
    {
      kind: "filesystem",
      requiredFor: ["filesystem"],
      status: filesystemStatus,
      canRequestFromApp: true
    },
    {
      kind: "screen",
      requiredFor: ["screen", "ocr"],
      status: "not_required",
      canRequestFromApp: true
    },
    {
      kind: "microphone",
      requiredFor: ["audio", "transcript"],
      status: "not_required",
      canRequestFromApp: true
    },
    {
      kind: "automation",
      requiredFor: ["terminal"],
      status: automationStatus,
      canRequestFromApp: false
    }
  ];
  const needsPermission = permissions.some(
    (permission) =>
      permission.status === "not_determined" ||
      permission.status === "denied" ||
      permission.status === "restricted" ||
      permission.status === "unknown"
  );
  return {
    enabled,
    status: !enabled ? "disabled" : needsPermission ? "needs_permission" : "ready",
    permissions
  };
}

function readPermissionStatus(
  settingsRepository: SettingsRepository,
  key: string,
  required: boolean
): ObservationPermissionStatus["status"] {
  if (!required) return "not_required";
  const value = settingsRepository.get<ObservationPermissionStatus["status"]>(key);
  return value ?? "not_determined";
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
