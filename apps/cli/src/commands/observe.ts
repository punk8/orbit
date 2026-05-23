import {
  createDefaultObservationStatus,
  type AllowedFolderRule,
  type ObservationPermissionStatus,
  type ObservationRuntimeStatus,
  type ObservationStatus
} from "@orbit/core";
import {
  openOrbitDatabase,
  readProtectedAppRules,
  SettingsRepository
} from "@orbit/db";
import { upsertProtectedAppRule, type ProtectedRuleInput } from "@orbit/db";
import { getCliConfig } from "../config";

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
