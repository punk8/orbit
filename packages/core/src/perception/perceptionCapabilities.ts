import type { Sensitivity } from "../types/common";
import type { ObservationRuntimeStatus, ProtectedAppRule } from "../observation/observationTypes";
import { defaultProtectedAppRules } from "../observation/observationPolicy";
import { hashObject } from "../hash";

export const DEFAULT_RAW_FRAME_TTL_MINUTES = 72 * 60;
export const DEFAULT_RAW_FRAME_STORAGE_CAP_BYTES = 2 * 1024 * 1024 * 1024;
export const DEFAULT_RAW_FRAME_RETENTION_POLICY_ID = "perception_raw_ttl_72h";

export function perceptionRawRetentionPolicyId(ttlMinutes: number): string {
  if (ttlMinutes === 24 * 60) return "perception_raw_ttl_24h";
  if (ttlMinutes === DEFAULT_RAW_FRAME_TTL_MINUTES) return DEFAULT_RAW_FRAME_RETENTION_POLICY_ID;
  if (ttlMinutes === 7 * 24 * 60) return "perception_raw_ttl_7d";
  return `perception_raw_ttl_${ttlMinutes}m`;
}

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

export type PerceptionSamplingPresetName = "conservative" | "balanced" | "intensive";

export interface PerceptionSamplingPreset {
  name: PerceptionSamplingPresetName;
  minimumBurstIntervalSeconds: number;
  framesPerBurst: number;
  frameSpacingMs: number;
  maxOcrFramesPerMinute: number;
  rawSidecars: "off" | "short_ttl";
  intendedUse: string;
}

export interface PerceptionSamplingPolicy {
  preset: PerceptionSamplingPresetName;
  minimumBurstIntervalSeconds: number;
  framesPerBurst: number;
  frameSpacingMs: number;
  maxOcrFramesPerMinute: number;
  maxCaptureDutyCyclePercent: number;
  rawFrameRetention: "disabled" | "short_ttl";
  rawFrameTtlIfEnabledMinutes: number;
  protectedAppAction: "skip_capture";
  externalAiUse: "disabled";
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
  userIntent: PerceptionDogfoodUserIntent;
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

export interface PerceptionResourceSnapshot {
  lowPowerMode: boolean;
  batteryPercent: number | null;
  rawSidecarBytes: number;
  queueDepth: number;
  providerRequestsLastHour: number;
  providerInputCharsPending: number;
  providerTokensLastHour: number;
}

export type PerceptionResourceLimitReason =
  | "low_power_mode"
  | "battery_below_threshold"
  | "raw_sidecar_storage_cap"
  | "queue_depth_cap"
  | "provider_request_cap"
  | "provider_input_size_cap"
  | "provider_token_cap";

export interface PerceptionResourceState {
  canCapture: boolean;
  state: "normal" | "paused_low_power" | "paused_resource_budget";
  reasons: PerceptionResourceLimitReason[];
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
  dogfoodRuntime: PerceptionDogfoodRuntimeStatus;
  sources: PerceptionSourceControl[];
  providerRoutes: PerceptionProviderRoute[];
  protectedApps: ProtectedAppRule[];
  samplingPreset: PerceptionSamplingPreset;
  samplingPolicy: PerceptionSamplingPolicy;
  resourcePolicy: PerceptionResourcePolicy;
  policySnapshot: PerceptionPolicySnapshot;
}

export type PerceptionSourcePolicyPatch = Partial<PerceptionSourcePolicy>;

export type PerceptionSourceRuntimeAction = "enable" | "disable" | "pause" | "resume" | "delete";

export type PerceptionDogfoodRuntimeState =
  | "needs_permission"
  | "observing"
  | "paused_user"
  | "paused_resource"
  | "protected"
  | "stopped"
  | "error";

export type PerceptionDogfoodUserIntent = "auto" | "manual" | "paused_user" | "stopped";

export type PerceptionDogfoodRuntimeReason =
  | "screen_recording_permission_missing"
  | "screen_recording_permission_granted"
  | "screen_recording_permission_revoked"
  | "user_paused"
  | "user_stopped"
  | "resource_policy_pause"
  | "protected_context"
  | "runtime_error"
  | "helper_missing"
  | "helper_timeout"
  | "sqlite_lock_or_migration_failed"
  | "native_abi_mismatch"
  | "storage_cap_reached";

export type PerceptionDogfoodRuntimeNextAction =
  | "grant_screen_recording_permission"
  | "wait_for_next_burst"
  | "resume_observation"
  | "resume_or_enable_observation"
  | "reduce_resource_pressure"
  | "switch_context_or_update_protection"
  | "inspect_runtime_error"
  | "repair_native_helper"
  | "retry_or_rebuild_native_helper"
  | "repair_local_database"
  | "rebuild_native_modules"
  | "run_cleanup_or_increase_storage_budget";

export type SourceInstallRuntimeFailureKind =
  | "helper_missing"
  | "helper_timeout"
  | "permission_missing"
  | "permission_revoked"
  | "protected_context"
  | "resource_paused"
  | "sqlite_lock"
  | "native_abi_mismatch"
  | "storage_cap_reached";

export type SourceInstallRuntimeHardeningCoverageStatus = "covered";

export interface SourceInstallRuntimeHardeningCase {
  kind: SourceInstallRuntimeFailureKind;
  status: SourceInstallRuntimeHardeningCoverageStatus;
  state: PerceptionDogfoodRuntimeState;
  reason: PerceptionDogfoodRuntimeReason;
  nextAction: PerceptionDogfoodRuntimeNextAction;
  auditOperations: string[];
}

export interface SourceInstallRuntimeHardeningReview {
  status: SourceInstallRuntimeHardeningCoverageStatus;
  cases: SourceInstallRuntimeHardeningCase[];
  covered: SourceInstallRuntimeFailureKind[];
  missing: SourceInstallRuntimeFailureKind[];
}

export interface PerceptionDogfoodRuntimeStatus {
  state: PerceptionDogfoodRuntimeState;
  permission: PerceptionPermissionStatus;
  reason: PerceptionDogfoodRuntimeReason;
  nextAction: PerceptionDogfoodRuntimeNextAction;
  autoStartEnabled: boolean;
  activeSourceKinds: PerceptionSourceKind[];
  hardening: SourceInstallRuntimeHardeningReview;
  lastTransitionAt?: string;
}

export interface StoredPerceptionSourceControl {
  sourceKind: PerceptionSourceKind;
  enabled?: boolean;
  paused?: boolean;
  userIntent?: PerceptionDogfoodUserIntent;
  permissionStatuses?: Partial<Record<PerceptionPermissionKind, PerceptionPermissionStatus>>;
  policy?: PerceptionSourcePolicyPatch;
  lastRuntimeChangedAt?: string;
  lastPolicyChangedAt?: string;
  lastPermissionCheckedAt?: string;
}

export interface StoredPerceptionSamplingPolicy {
  preset?: PerceptionSamplingPresetName;
}

export interface PerceptionPolicySnapshotSource {
  sourceKind: PerceptionSourceKind;
  enabled: boolean;
  paused: boolean;
  status: ObservationRuntimeStatus;
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

export interface PerceptionPolicySnapshot {
  id: string;
  samplingPolicy: PerceptionSamplingPolicy;
  sourcePolicies: PerceptionPolicySnapshotSource[];
  providerRoutes: PerceptionProviderRoute[];
  protectedAppRuleCount: number;
  resourcePolicy: PerceptionResourcePolicy;
}

export const perceptionSamplingPresets: readonly PerceptionSamplingPreset[] = [
  {
    name: "conservative",
    minimumBurstIntervalSeconds: 120,
    framesPerBurst: 3,
    frameSpacingMs: 1000,
    maxOcrFramesPerMinute: 3,
    rawSidecars: "short_ttl",
    intendedUse: "Default local verification evidence with conservative battery use."
  },
  {
    name: "balanced",
    minimumBurstIntervalSeconds: 60,
    framesPerBurst: 4,
    frameSpacingMs: 1000,
    maxOcrFramesPerMinute: 6,
    rawSidecars: "off",
    intendedUse: "User-selected dogfood mode."
  },
  {
    name: "intensive",
    minimumBurstIntervalSeconds: 30,
    framesPerBurst: 6,
    frameSpacingMs: 500,
    maxOcrFramesPerMinute: 12,
    rawSidecars: "short_ttl",
    intendedUse: "Visible debugging and demo mode."
  }
];

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
  if (sourceKind === "screen") {
    return {
      sensitivity: "confidential",
      canStoreRaw: true,
      canStoreSummary: true,
      canUseForAI: false,
      canExportToAgent: false,
      retentionPolicyId: perceptionRawRetentionPolicyId(DEFAULT_RAW_FRAME_TTL_MINUTES),
      rawRetentionTtlMinutes: DEFAULT_RAW_FRAME_TTL_MINUTES,
      protectedAppsEnabled: true,
      deleteRawOnDisable: true
    };
  }
  return {
    sensitivity: sourceKind === "vision" ? "confidential" : "internal",
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
  return perceptionResourcePolicyForSampling(defaultPerceptionSamplingPolicy());
}

export function perceptionResourcePolicyForSampling(
  samplingPolicy: PerceptionSamplingPolicy
): PerceptionResourcePolicy {
  return {
    cpu: {
      maxCaptureDutyCyclePercent: 10,
      minScreenCaptureIntervalMs: samplingPolicy.minimumBurstIntervalSeconds * 1000,
      maxOcrFramesPerMinute: samplingPolicy.maxOcrFramesPerMinute
    },
    battery: {
      pauseOnLowPowerMode: true,
      pauseBelowPercent: 20
    },
    storage: {
      maxRawSidecarBytes: DEFAULT_RAW_FRAME_STORAGE_CAP_BYTES,
      defaultRawTtlMinutes: DEFAULT_RAW_FRAME_TTL_MINUTES,
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

export function evaluatePerceptionResourceState(
  policy: PerceptionResourcePolicy,
  snapshot: PerceptionResourceSnapshot
): PerceptionResourceState {
  const reasons: PerceptionResourceLimitReason[] = [];
  if (policy.battery.pauseOnLowPowerMode && snapshot.lowPowerMode) {
    reasons.push("low_power_mode");
  }
  if (
    snapshot.batteryPercent !== null &&
    snapshot.batteryPercent <= policy.battery.pauseBelowPercent
  ) {
    reasons.push("battery_below_threshold");
  }
  if (snapshot.rawSidecarBytes > policy.storage.maxRawSidecarBytes) {
    reasons.push("raw_sidecar_storage_cap");
  }
  if (snapshot.queueDepth > policy.queue.maxItems) {
    reasons.push("queue_depth_cap");
  }
  if (snapshot.providerRequestsLastHour > policy.provider.maxRequestsPerHour) {
    reasons.push("provider_request_cap");
  }
  if (snapshot.providerInputCharsPending > policy.provider.maxInputCharsPerRequest) {
    reasons.push("provider_input_size_cap");
  }
  if (snapshot.providerTokensLastHour > policy.provider.maxTokensPerHour) {
    reasons.push("provider_token_cap");
  }

  const state =
    reasons[0] === "low_power_mode"
      ? "paused_low_power"
      : reasons.length > 0
        ? "paused_resource_budget"
        : "normal";
  return {
    canCapture: reasons.length === 0,
    state,
    reasons
  };
}

const sourceInstallRuntimeHardeningCases: readonly SourceInstallRuntimeHardeningCase[] = [
  {
    kind: "helper_missing",
    status: "covered",
    state: "error",
    reason: "helper_missing",
    nextAction: "repair_native_helper",
    auditOperations: ["perception.burst_failed", "perception.capture_screen_ocr"]
  },
  {
    kind: "helper_timeout",
    status: "covered",
    state: "error",
    reason: "helper_timeout",
    nextAction: "retry_or_rebuild_native_helper",
    auditOperations: ["perception.burst_failed", "perception.capture_screen_ocr"]
  },
  {
    kind: "permission_missing",
    status: "covered",
    state: "needs_permission",
    reason: "screen_recording_permission_missing",
    nextAction: "grant_screen_recording_permission",
    auditOperations: ["perception.permission_checked"]
  },
  {
    kind: "permission_revoked",
    status: "covered",
    state: "needs_permission",
    reason: "screen_recording_permission_revoked",
    nextAction: "grant_screen_recording_permission",
    auditOperations: ["perception.permission_revoked", "perception.runtime_stopped"]
  },
  {
    kind: "protected_context",
    status: "covered",
    state: "protected",
    reason: "protected_context",
    nextAction: "switch_context_or_update_protection",
    auditOperations: ["perception.protected_context_skipped", "perception.protected_content_dropped"]
  },
  {
    kind: "resource_paused",
    status: "covered",
    state: "paused_resource",
    reason: "resource_policy_pause",
    nextAction: "reduce_resource_pressure",
    auditOperations: ["perception.resource_paused", "perception.burst_skipped"]
  },
  {
    kind: "sqlite_lock",
    status: "covered",
    state: "error",
    reason: "sqlite_lock_or_migration_failed",
    nextAction: "repair_local_database",
    auditOperations: ["background.ingest_cycle"]
  },
  {
    kind: "native_abi_mismatch",
    status: "covered",
    state: "error",
    reason: "native_abi_mismatch",
    nextAction: "rebuild_native_modules",
    auditOperations: ["background.ingest_cycle"]
  },
  {
    kind: "storage_cap_reached",
    status: "covered",
    state: "paused_resource",
    reason: "storage_cap_reached",
    nextAction: "run_cleanup_or_increase_storage_budget",
    auditOperations: ["perception.resource_paused", "perception.sidecar_cleanup"]
  }
];

export function getSourceInstallRuntimeHardeningCases(): SourceInstallRuntimeHardeningCase[] {
  return sourceInstallRuntimeHardeningCases.map((item) => ({ ...item }));
}

export function mapSourceInstallRuntimeFailure(
  kind: SourceInstallRuntimeFailureKind
): SourceInstallRuntimeHardeningCase {
  const found = sourceInstallRuntimeHardeningCases.find((item) => item.kind === kind);
  if (!found) {
    throw new Error(`Unsupported source-install runtime failure kind: ${kind}`);
  }
  return { ...found };
}

export function buildSourceInstallRuntimeHardeningReview(): SourceInstallRuntimeHardeningReview {
  const cases = getSourceInstallRuntimeHardeningCases();
  return {
    status: "covered",
    cases,
    covered: cases.map((item) => item.kind),
    missing: []
  };
}

export function defaultPerceptionSamplingPreset(): PerceptionSamplingPreset {
  return { ...perceptionSamplingPresets[0]! };
}

export function defaultPerceptionSamplingPolicy(): PerceptionSamplingPolicy {
  return makePerceptionSamplingPolicy(defaultPerceptionSamplingPreset());
}

export function readPerceptionSamplingPreset(
  value: unknown = "conservative"
): PerceptionSamplingPreset {
  const preset = perceptionSamplingPresets.find((candidate) => candidate.name === value);
  return { ...(preset ?? perceptionSamplingPresets[0]!) };
}

function makePerceptionSamplingPolicy(
  preset: PerceptionSamplingPreset
): PerceptionSamplingPolicy {
  return {
    preset: preset.name,
    minimumBurstIntervalSeconds: preset.minimumBurstIntervalSeconds,
    framesPerBurst: preset.framesPerBurst,
    frameSpacingMs: preset.frameSpacingMs,
    maxOcrFramesPerMinute: preset.maxOcrFramesPerMinute,
    maxCaptureDutyCyclePercent: 10,
    rawFrameRetention: preset.rawSidecars === "short_ttl" ? "short_ttl" : "disabled",
    rawFrameTtlIfEnabledMinutes: DEFAULT_RAW_FRAME_TTL_MINUTES,
    protectedAppAction: "skip_capture",
    externalAiUse: "disabled"
  };
}

export function createDefaultPerceptionStatus(
  storedSources: StoredPerceptionSourceControl[] = [],
  storedProviderRoutes: PerceptionProviderRoute[] = [],
  protectedApps: ProtectedAppRule[] = defaultProtectedAppRules(),
  storedSamplingPolicy: StoredPerceptionSamplingPolicy = {}
): PerceptionControlPlaneStatus {
  const storedByKind = new Map(storedSources.map((source) => [source.sourceKind, source]));
  const sources = perceptionCapabilityDescriptors.map((descriptor) =>
    buildPerceptionSourceControl(descriptor, storedByKind.get(descriptor.sourceKind))
  );
  const routeByTask = new Map(storedProviderRoutes.map((route) => [route.task, route]));
  const providerRoutes = defaultPerceptionProviderRoutes.map((route) =>
    normalizeProviderRoute(routeByTask.get(route.task) ?? route)
  );
  const samplingPreset = readPerceptionSamplingPreset(storedSamplingPolicy.preset);
  const samplingPolicy = makePerceptionSamplingPolicy(samplingPreset);
  const resourcePolicy = perceptionResourcePolicyForSampling(samplingPolicy);
  const status = {
    status: summarizePerceptionStatus(sources),
    enabled: sources.some((source) => source.enabled),
    paused: sources.some((source) => source.enabled && source.paused),
    dogfoodRuntime: summarizeDogfoodRuntimeStatus(sources),
    sources,
    providerRoutes,
    protectedApps,
    samplingPreset,
    samplingPolicy,
    resourcePolicy
  };
  return {
    ...status,
    policySnapshot: createPerceptionPolicySnapshot(status)
  };
}

export function createPerceptionPolicySnapshot(
  status: Omit<PerceptionControlPlaneStatus, "policySnapshot"> | PerceptionControlPlaneStatus
): PerceptionPolicySnapshot {
  const snapshotBody = {
    samplingPolicy: status.samplingPolicy,
    sourcePolicies: status.sources.map((source) => ({
      sourceKind: source.sourceKind,
      enabled: source.enabled,
      paused: source.paused,
      status: source.status,
      sensitivity: source.policy.sensitivity,
      canStoreRaw: source.policy.canStoreRaw,
      canStoreSummary: source.policy.canStoreSummary,
      canUseForAI: source.policy.canUseForAI,
      canExportToAgent: source.policy.canExportToAgent,
      retentionPolicyId: source.policy.retentionPolicyId,
      rawRetentionTtlMinutes: source.policy.rawRetentionTtlMinutes,
      protectedAppsEnabled: source.policy.protectedAppsEnabled,
      deleteRawOnDisable: source.policy.deleteRawOnDisable
    })),
    providerRoutes: status.providerRoutes.map((route) => ({ ...route })),
    protectedAppRuleCount: status.protectedApps.filter((rule) => rule.enabled).length,
    resourcePolicy: status.resourcePolicy
  };
  return {
    id: `perception_policy_${hashObject(snapshotBody).slice(0, 16)}`,
    ...snapshotBody
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
  const userIntent = stored?.userIntent ?? (paused ? "paused_user" : "manual");
  const permissionGates = descriptor.requiredPermissions.map((permission) =>
    buildPermissionGate(permission, stored?.permissionStatuses?.[permission], enabled)
  );
  const source: PerceptionSourceControl = {
    sourceKind: descriptor.sourceKind,
    displayName: descriptor.displayName,
    description: descriptor.description,
    enabled,
    paused,
    userIntent,
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

function summarizeDogfoodRuntimeStatus(
  sources: PerceptionSourceControl[]
): PerceptionDogfoodRuntimeStatus {
  const screenOcrSources = sources.filter(
    (source) => source.sourceKind === "screen" || source.sourceKind === "ocr"
  );
  const screenPermissionGate =
    screenOcrSources
      .flatMap((source) => source.permissionGates)
      .find((permission) => permission.kind === "screen")?.status ?? "not_determined";
  const screenPermission =
    screenPermissionGate === "not_required" ? "not_determined" : screenPermissionGate;
  const lastTransitionAt = screenOcrSources
    .flatMap((source) => [
      source.lastRuntimeChangedAt,
      source.lastPermissionCheckedAt,
      source.lastPolicyChangedAt
    ])
    .filter((timestamp): timestamp is string => Boolean(timestamp))
    .sort()
    .at(-1);
  const activeSourceKinds = screenOcrSources
    .filter((source) => source.enabled && !source.paused)
    .map((source) => source.sourceKind);

  if (screenOcrSources.some((source) => source.userIntent === "stopped")) {
    return dogfoodRuntimeStatus({
      state: "stopped",
      permission: screenPermission,
      reason: "user_stopped",
      nextAction: "resume_or_enable_observation",
      autoStartEnabled: false,
      activeSourceKinds: [],
      lastTransitionAt
    });
  }

  if (screenPermission !== "granted") {
    return dogfoodRuntimeStatus({
      state: "needs_permission",
      permission: screenPermission,
      reason:
        screenPermission === "denied" || screenPermission === "restricted"
          ? "screen_recording_permission_revoked"
          : "screen_recording_permission_missing",
      nextAction: "grant_screen_recording_permission",
      autoStartEnabled: !screenOcrSources.some((source) => source.userIntent === "paused_user"),
      activeSourceKinds: [],
      lastTransitionAt
    });
  }

  if (
    screenOcrSources.some(
      (source) => source.userIntent === "paused_user" || (source.enabled && source.paused)
    )
  ) {
    return dogfoodRuntimeStatus({
      state: "paused_user",
      permission: screenPermission,
      reason: "user_paused",
      nextAction: "resume_observation",
      autoStartEnabled: false,
      activeSourceKinds: [],
      lastTransitionAt
    });
  }

  return dogfoodRuntimeStatus({
    state: "observing",
    permission: screenPermission,
    reason: "screen_recording_permission_granted",
    nextAction: "wait_for_next_burst",
    autoStartEnabled: true,
    activeSourceKinds:
      activeSourceKinds.length > 0 ? activeSourceKinds : (["screen", "ocr"] as PerceptionSourceKind[]),
    lastTransitionAt
  });
}

type PerceptionDogfoodRuntimeStatusInput = Omit<
  PerceptionDogfoodRuntimeStatus,
  "hardening" | "lastTransitionAt"
> & {
  lastTransitionAt?: string | undefined;
};

function dogfoodRuntimeStatus(
  status: PerceptionDogfoodRuntimeStatusInput
): PerceptionDogfoodRuntimeStatus {
  const next: PerceptionDogfoodRuntimeStatus = {
    state: status.state,
    permission: status.permission,
    reason: status.reason,
    nextAction: status.nextAction,
    autoStartEnabled: status.autoStartEnabled,
    activeSourceKinds: status.activeSourceKinds,
    hardening: buildSourceInstallRuntimeHardeningReview()
  };
  if (status.lastTransitionAt) next.lastTransitionAt = status.lastTransitionAt;
  return next;
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
