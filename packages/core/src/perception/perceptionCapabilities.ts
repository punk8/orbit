import type { Sensitivity } from "../types/common";
import type { ObservationRuntimeStatus, ProtectedAppRule } from "../observation/observationTypes";
import { defaultProtectedAppRules } from "../observation/observationPolicy";

export type PerceptionSourceKind =
  | "screen"
  | "ocr"
  | "vision"
  | "microphone_audio"
  | "system_audio"
  | "transcript";

export type PerceptionProviderTask = "ocr" | "vision" | "transcription";

export type PerceptionProviderKind = "disabled" | "mock" | "local" | "openai-compatible";

export type PerceptionPermissionKind = "screen" | "microphone" | "system_audio";

export type PerceptionPermissionStatus =
  | "not_required"
  | "not_determined"
  | "granted"
  | "denied"
  | "restricted"
  | "unknown";

export interface PerceptionCapabilityDescriptor {
  sourceKind: PerceptionSourceKind;
  displayName: string;
  description: string;
  status: "control_plane";
  capturesRawMedia: false;
  enabledByDefault: false;
  requiresExplicitPermission: true;
  defaultAgentExport: false;
  requiredPermissions: PerceptionPermissionKind[];
  providerTasks: PerceptionProviderTask[];
}

export interface PerceptionSourcePolicy {
  sensitivity: Sensitivity;
  canStoreRaw: boolean;
  canStoreSummary: boolean;
  canUseForAI: boolean;
  canExportToAgent: boolean;
  retentionPolicyId: string;
  rawRetentionTtlMinutes: number | null;
  protectedAppsEnabled: boolean;
  deleteRawOnDisable: boolean;
}

export interface PerceptionPermissionGate {
  kind: PerceptionPermissionKind;
  status: PerceptionPermissionStatus;
  canRequestFromApp: boolean;
  instructions?: string;
}

export interface PerceptionSourceControl {
  sourceKind: PerceptionSourceKind;
  displayName: string;
  description: string;
  enabled: boolean;
  paused: boolean;
  status: ObservationRuntimeStatus;
  requiredPermissions: PerceptionPermissionKind[];
  permissionGates: PerceptionPermissionGate[];
  providerTasks: PerceptionProviderTask[];
  policy: PerceptionSourcePolicy;
  lastRuntimeChangedAt?: string;
  lastPolicyChangedAt?: string;
  lastPermissionCheckedAt?: string;
}

export interface PerceptionResourcePolicy {
  cpu: {
    maxCaptureDutyCyclePercent: number;
    minScreenCaptureIntervalMs: number;
    maxOcrFramesPerMinute: number;
  };
  battery: {
    pauseOnLowPowerMode: boolean;
    pauseBelowPercent: number;
  };
  storage: {
    maxRawSidecarBytes: number;
    defaultRawTtlMinutes: number;
    cleanupIntervalMinutes: number;
  };
  queue: {
    maxItems: number;
    drainBatchSize: number;
    dropRawPayloadsFirst: boolean;
  };
  provider: {
    maxRequestsPerHour: number;
    maxInputCharsPerRequest: number;
    maxTokensPerHour: number;
    allowExternalByDefault: boolean;
  };
}

export interface PerceptionProviderRoute {
  task: PerceptionProviderTask;
  provider: PerceptionProviderKind;
  enabled: boolean;
  allowExternal: boolean;
  model?: string;
  updatedAt?: string;
}

export interface PerceptionControlPlaneStatus {
  status: ObservationRuntimeStatus;
  enabled: boolean;
  paused: boolean;
  sources: PerceptionSourceControl[];
  providerRoutes: PerceptionProviderRoute[];
  protectedApps: ProtectedAppRule[];
  resourcePolicy: PerceptionResourcePolicy;
}

export type PerceptionSourcePolicyPatch = Partial<PerceptionSourcePolicy>;

export type PerceptionSourceRuntimeAction = "enable" | "disable" | "pause" | "resume" | "delete";

export interface StoredPerceptionSourceControl {
  sourceKind: PerceptionSourceKind;
  enabled?: boolean;
  paused?: boolean;
  permissionStatuses?: Partial<Record<PerceptionPermissionKind, PerceptionPermissionStatus>>;
  policy?: PerceptionSourcePolicyPatch;
  lastRuntimeChangedAt?: string;
  lastPolicyChangedAt?: string;
  lastPermissionCheckedAt?: string;
}

export const perceptionCapabilityDescriptors: readonly PerceptionCapabilityDescriptor[] = [
  {
    sourceKind: "screen",
    displayName: "Screen perception",
    description: "Explicit screen or window capture control surface.",
    status: "control_plane",
    capturesRawMedia: false,
    enabledByDefault: false,
    requiresExplicitPermission: true,
    defaultAgentExport: false,
    requiredPermissions: ["screen"],
    providerTasks: []
  },
  {
    sourceKind: "ocr",
    displayName: "OCR",
    description: "Text extraction over explicit screen or window observations.",
    status: "control_plane",
    capturesRawMedia: false,
    enabledByDefault: false,
    requiresExplicitPermission: true,
    defaultAgentExport: false,
    requiredPermissions: ["screen"],
    providerTasks: ["ocr"]
  },
  {
    sourceKind: "vision",
    displayName: "Vision summaries",
    description: "Model-assisted summaries over bounded visual observations.",
    status: "control_plane",
    capturesRawMedia: false,
    enabledByDefault: false,
    requiresExplicitPermission: true,
    defaultAgentExport: false,
    requiredPermissions: ["screen"],
    providerTasks: ["vision"]
  },
  {
    sourceKind: "microphone_audio",
    displayName: "Microphone audio",
    description: "Explicit meeting/session microphone capture control surface.",
    status: "control_plane",
    capturesRawMedia: false,
    enabledByDefault: false,
    requiresExplicitPermission: true,
    defaultAgentExport: false,
    requiredPermissions: ["microphone"],
    providerTasks: ["transcription"]
  },
  {
    sourceKind: "system_audio",
    displayName: "System audio",
    description: "Explicit selected system-audio capture control surface.",
    status: "control_plane",
    capturesRawMedia: false,
    enabledByDefault: false,
    requiresExplicitPermission: true,
    defaultAgentExport: false,
    requiredPermissions: ["system_audio"],
    providerTasks: ["transcription"]
  },
  {
    sourceKind: "transcript",
    displayName: "Transcripts",
    description: "Redacted transcript generation from explicit audio sessions.",
    status: "control_plane",
    capturesRawMedia: false,
    enabledByDefault: false,
    requiresExplicitPermission: true,
    defaultAgentExport: false,
    requiredPermissions: ["microphone"],
    providerTasks: ["transcription"]
  }
];

export const defaultPerceptionProviderRoutes: readonly PerceptionProviderRoute[] = [
  {
    task: "ocr",
    provider: "disabled",
    enabled: false,
    allowExternal: false
  },
  {
    task: "vision",
    provider: "disabled",
    enabled: false,
    allowExternal: false
  },
  {
    task: "transcription",
    provider: "disabled",
    enabled: false,
    allowExternal: false
  }
];

export function defaultPerceptionSourcePolicy(
  sourceKind: PerceptionSourceKind
): PerceptionSourcePolicy {
  return {
    sensitivity: sourceKind === "screen" || sourceKind === "vision" ? "confidential" : "internal",
    canStoreRaw: false,
    canStoreSummary: true,
    canUseForAI: false,
    canExportToAgent: false,
    retentionPolicyId: "perception_summary_only",
    rawRetentionTtlMinutes: null,
    protectedAppsEnabled: true,
    deleteRawOnDisable: true
  };
}

export function defaultPerceptionResourcePolicy(): PerceptionResourcePolicy {
  return {
    cpu: {
      maxCaptureDutyCyclePercent: 10,
      minScreenCaptureIntervalMs: 30_000,
      maxOcrFramesPerMinute: 6
    },
    battery: {
      pauseOnLowPowerMode: true,
      pauseBelowPercent: 20
    },
    storage: {
      maxRawSidecarBytes: 250 * 1024 * 1024,
      defaultRawTtlMinutes: 60,
      cleanupIntervalMinutes: 15
    },
    queue: {
      maxItems: 1000,
      drainBatchSize: 25,
      dropRawPayloadsFirst: true
    },
    provider: {
      maxRequestsPerHour: 60,
      maxInputCharsPerRequest: 4000,
      maxTokensPerHour: 100_000,
      allowExternalByDefault: false
    }
  };
}

export function createDefaultPerceptionStatus(
  storedSources: StoredPerceptionSourceControl[] = [],
  storedProviderRoutes: PerceptionProviderRoute[] = [],
  protectedApps: ProtectedAppRule[] = defaultProtectedAppRules()
): PerceptionControlPlaneStatus {
  const storedByKind = new Map(storedSources.map((source) => [source.sourceKind, source]));
  const sources = perceptionCapabilityDescriptors.map((descriptor) =>
    buildPerceptionSourceControl(descriptor, storedByKind.get(descriptor.sourceKind))
  );
  const routeByTask = new Map(storedProviderRoutes.map((route) => [route.task, route]));
  const providerRoutes = defaultPerceptionProviderRoutes.map((route) =>
    normalizeProviderRoute(routeByTask.get(route.task) ?? route)
  );
  return {
    status: summarizePerceptionStatus(sources),
    enabled: sources.some((source) => source.enabled),
    paused: sources.some((source) => source.enabled && source.paused),
    sources,
    providerRoutes,
    protectedApps,
    resourcePolicy: defaultPerceptionResourcePolicy()
  };
}

export function normalizePerceptionProviderKind(value: unknown): PerceptionProviderKind {
  if (value === "mock" || value === "local" || value === "openai-compatible") return value;
  return "disabled";
}

export function normalizePerceptionProviderTask(value: unknown): PerceptionProviderTask {
  if (value === "vision" || value === "transcription") return value;
  return "ocr";
}

export function isPerceptionSourceKind(value: unknown): value is PerceptionSourceKind {
  return (
    value === "screen" ||
    value === "ocr" ||
    value === "vision" ||
    value === "microphone_audio" ||
    value === "system_audio" ||
    value === "transcript"
  );
}

export function isPerceptionProviderTask(value: unknown): value is PerceptionProviderTask {
  return value === "ocr" || value === "vision" || value === "transcription";
}

function buildPerceptionSourceControl(
  descriptor: PerceptionCapabilityDescriptor,
  stored: StoredPerceptionSourceControl | undefined
): PerceptionSourceControl {
  const policy = {
    ...defaultPerceptionSourcePolicy(descriptor.sourceKind),
    ...(stored?.policy ?? {})
  };
  const enabled = stored?.enabled ?? false;
  const paused = stored?.paused ?? false;
  const permissionGates = descriptor.requiredPermissions.map((permission) =>
    buildPermissionGate(permission, stored?.permissionStatuses?.[permission], enabled)
  );
  const source: PerceptionSourceControl = {
    sourceKind: descriptor.sourceKind,
    displayName: descriptor.displayName,
    description: descriptor.description,
    enabled,
    paused,
    status: readPerceptionSourceStatus(enabled, paused, permissionGates),
    requiredPermissions: descriptor.requiredPermissions,
    permissionGates,
    providerTasks: descriptor.providerTasks,
    policy
  };
  if (stored?.lastRuntimeChangedAt) source.lastRuntimeChangedAt = stored.lastRuntimeChangedAt;
  if (stored?.lastPolicyChangedAt) source.lastPolicyChangedAt = stored.lastPolicyChangedAt;
  if (stored?.lastPermissionCheckedAt) {
    source.lastPermissionCheckedAt = stored.lastPermissionCheckedAt;
  }
  return source;
}

function buildPermissionGate(
  kind: PerceptionPermissionKind,
  storedStatus: PerceptionPermissionStatus | undefined,
  required: boolean
): PerceptionPermissionGate {
  return {
    kind,
    status: required ? (storedStatus ?? "not_determined") : "not_required",
    canRequestFromApp: kind !== "system_audio",
    instructions: readPermissionInstructions(kind)
  };
}

function readPerceptionSourceStatus(
  enabled: boolean,
  paused: boolean,
  permissions: PerceptionPermissionGate[]
): ObservationRuntimeStatus {
  if (!enabled) return "disabled";
  if (paused) return "paused";
  if (
    permissions.some(
      (permission) =>
        permission.status === "not_determined" ||
        permission.status === "denied" ||
        permission.status === "restricted" ||
        permission.status === "unknown"
    )
  ) {
    return "needs_permission";
  }
  return "ready";
}

function summarizePerceptionStatus(sources: PerceptionSourceControl[]): ObservationRuntimeStatus {
  const enabledSources = sources.filter((source) => source.enabled);
  if (enabledSources.length === 0) return "disabled";
  if (enabledSources.some((source) => source.status === "needs_permission")) {
    return "needs_permission";
  }
  if (enabledSources.some((source) => source.status === "paused")) return "paused";
  return "ready";
}

function normalizeProviderRoute(route: PerceptionProviderRoute): PerceptionProviderRoute {
  const provider = normalizePerceptionProviderKind(route.provider);
  return {
    task: normalizePerceptionProviderTask(route.task),
    provider,
    enabled: provider !== "disabled",
    allowExternal: provider === "openai-compatible" ? route.allowExternal : false,
    ...(route.model ? { model: route.model } : {}),
    ...(route.updatedAt ? { updatedAt: route.updatedAt } : {})
  };
}

function readPermissionInstructions(kind: PerceptionPermissionKind): string {
  if (kind === "screen") return "Grant macOS Screen Recording permission before capture.";
  if (kind === "microphone") return "Grant macOS Microphone permission before audio capture.";
  return "System audio support depends on the selected macOS capture path.";
}
