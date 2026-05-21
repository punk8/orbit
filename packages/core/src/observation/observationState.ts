import { defaultProtectedAppRules } from "./observationPolicy";
import type {
  ObservationRuntimeStatus,
  ObservationStatus,
  ObservationTier,
  ObservationTierStatus
} from "./observationTypes";

const allowedTransitions: Record<ObservationRuntimeStatus, ObservationRuntimeStatus[]> = {
  not_configured: ["ready", "needs_permission"],
  needs_permission: ["ready", "disabled"],
  ready: ["collecting", "disabled"],
  collecting: ["paused", "warning", "error", "disabled"],
  paused: ["collecting", "disabled"],
  warning: ["collecting", "paused", "error"],
  error: ["ready", "disabled"],
  disabled: ["ready"]
};

export function assertObservationStatusTransition(
  from: ObservationRuntimeStatus,
  to: ObservationRuntimeStatus
): void {
  if (from === to) return;
  if (!allowedTransitions[from].includes(to)) {
    throw new Error(`Invalid observation status transition: ${from} -> ${to}`);
  }
}

export function transitionObservationStatus(
  from: ObservationRuntimeStatus,
  to: ObservationRuntimeStatus
): ObservationRuntimeStatus {
  assertObservationStatusTransition(from, to);
  return to;
}

export function createDefaultObservationStatus(
  overrides: Partial<ObservationStatus> = {}
): ObservationStatus {
  const tiers: Record<ObservationTier, ObservationTierStatus> = {
    tier1: {
      enabled: false,
      status: "not_configured",
      sourceKinds: ["desktop"]
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
  const permissions: ObservationStatus["permissions"] = [
    {
      kind: "accessibility",
      requiredFor: ["accessibility", "browser"],
      status: "not_required",
      canRequestFromApp: false
    },
    {
      kind: "filesystem",
      requiredFor: ["filesystem"],
      status: "not_required",
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
      status: "not_required",
      canRequestFromApp: false
    }
  ];

  const status: ObservationStatus = {
    status: overrides.status ?? "not_configured",
    enabled: overrides.enabled ?? false,
    paused: overrides.paused ?? false,
    tiers: {
      ...tiers,
      ...(overrides.tiers ?? {})
    },
    permissions: overrides.permissions ?? permissions,
    protectedApps: overrides.protectedApps ?? defaultProtectedAppRules(),
    allowedFolders: overrides.allowedFolders ?? [],
    queueDepth: overrides.queueDepth ?? 0
  };
  if (overrides.activeRuntimeSessionId) {
    status.activeRuntimeSessionId = overrides.activeRuntimeSessionId;
  }
  if (overrides.lastStartedAt) status.lastStartedAt = overrides.lastStartedAt;
  if (overrides.lastStoppedAt) status.lastStoppedAt = overrides.lastStoppedAt;
  if (overrides.lastEventAt) status.lastEventAt = overrides.lastEventAt;
  if (overrides.lastError) status.lastError = overrides.lastError;
  return status;
}
