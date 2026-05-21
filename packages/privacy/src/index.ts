import type { PerceptionControlPlaneStatus } from "@orbit/core";

const secretPatterns = [
  /authorization:\s*bearer\s+[a-z0-9._~+/=-]+/gi,
  /api[_-]?key\s*[:=]\s*["']?[a-z0-9._~+/=-]+["']?/gi,
  /password\s*[:=]\s*["']?[^"'\s]+["']?/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi,
  /\b(?:\+?\d[\d\s().-]{7,}\d)\b/g,
  /https?:\/\/[^\s"'<>]+/gi,
  /\/Users\/[^\s"'<>]+/g
];

export function redactSecrets(input: string): string {
  return secretPatterns.reduce((text, pattern) => text.replace(pattern, "[REDACTED]"), input);
}

export type ReleaseGateStatus = "pass" | "fail" | "needs_data";

export interface ReleaseGateCheck {
  id: string;
  status: ReleaseGateStatus;
  message: string;
  details?: Record<string, unknown>;
}

export interface PerceptionCleanupSummary {
  scannedEvents: number;
  cleanedEvents: number;
  removedRawRefs: number;
  removedAttachments: number;
  deletedLocalSidecars: number;
  preservedSummaries: number;
}

export interface PerceptionReleaseGateInput {
  perception: PerceptionControlPlaneStatus;
  auditOperations?: string[];
  cleanup?: PerceptionCleanupSummary;
  packaging?: {
    excludesTmp: boolean;
    excludesFixtures: boolean;
    nativeHelperMode: "none" | "mock" | "unsigned" | "signed";
    signed: boolean;
    notarized: boolean;
  };
}

export interface PerceptionReleaseGateReport {
  status: "pass" | "fail";
  checks: ReleaseGateCheck[];
}

const requiredAuditOperationGroups: Array<{
  id: string;
  operations: string[];
  mode: "all" | "any";
}> = [
  {
    id: "capture_start_stop",
    operations: ["perception.capture.start", "perception.capture.stop"],
    mode: "all"
  },
  { id: "redaction_failure", operations: ["perception.redaction_failure"], mode: "any" },
  { id: "model_call", operations: ["ai.draft_knowledge", "perception.vision_fixture_ingest"], mode: "any" },
  { id: "transcription", operations: ["perception.transcription"], mode: "any" },
  { id: "deletion", operations: ["perception.sidecar_cleanup", "perception.delete"], mode: "any" },
  { id: "handoff", operations: ["handoff.generate"], mode: "any" }
];

export function evaluatePerceptionReleaseGate(
  input: PerceptionReleaseGateInput
): PerceptionReleaseGateReport {
  const checks = [
    noDefaultCaptureCheck(input.perception),
    rawStorageDefaultOffCheck(input.perception),
    protectedAppsCheck(input.perception),
    resourceBudgetCheck(input.perception),
    cleanupCheck(input.cleanup),
    auditCoverageCheck(input.auditOperations ?? []),
    packagingCheck(input.packaging)
  ];
  return {
    status: checks.some((check) => check.status === "fail") ? "fail" : "pass",
    checks
  };
}

function noDefaultCaptureCheck(perception: PerceptionControlPlaneStatus): ReleaseGateCheck {
  const enabledSources = perception.sources
    .filter((source) => source.enabled)
    .map((source) => source.sourceKind);
  const enabledProviders = perception.providerRoutes
    .filter((route) => route.enabled || route.allowExternal)
    .map((route) => route.task);
  const status = enabledSources.length === 0 && enabledProviders.length === 0 ? "pass" : "fail";
  return {
    id: "no_default_capture",
    status,
    message:
      status === "pass"
        ? "All high-risk perception sources and provider routes are disabled by default."
        : "Perception capture or provider routes are enabled by default.",
    details: { enabledSources, enabledProviders }
  };
}

function rawStorageDefaultOffCheck(perception: PerceptionControlPlaneStatus): ReleaseGateCheck {
  const rawEnabled = perception.sources
    .filter((source) => source.policy.canStoreRaw || source.policy.rawRetentionTtlMinutes !== null)
    .map((source) => source.sourceKind);
  const status = rawEnabled.length === 0 ? "pass" : "fail";
  return {
    id: "raw_storage_default_off",
    status,
    message:
      status === "pass"
        ? "Raw perception sidecars are off by default."
        : "One or more perception sources allow raw sidecars.",
    details: { rawEnabled }
  };
}

function protectedAppsCheck(perception: PerceptionControlPlaneStatus): ReleaseGateCheck {
  const unprotected = perception.sources
    .filter((source) => !source.policy.protectedAppsEnabled)
    .map((source) => source.sourceKind);
  const enabledProtectedApps = perception.protectedApps.filter((rule) => rule.enabled).length;
  const status = unprotected.length === 0 && enabledProtectedApps > 0 ? "pass" : "fail";
  return {
    id: "protected_apps",
    status,
    message:
      status === "pass"
        ? "Protected app rules are enabled for perception sources."
        : "Protected app exclusions are missing or disabled.",
    details: { unprotected, enabledProtectedApps }
  };
}

function resourceBudgetCheck(perception: PerceptionControlPlaneStatus): ReleaseGateCheck {
  const budget = perception.resourcePolicy;
  const failures = [
    budget.cpu.maxCaptureDutyCyclePercent > 0 && budget.cpu.maxCaptureDutyCyclePercent <= 25,
    budget.cpu.minScreenCaptureIntervalMs >= 1000,
    budget.battery.pauseOnLowPowerMode,
    budget.battery.pauseBelowPercent > 0,
    budget.storage.maxRawSidecarBytes > 0,
    budget.storage.defaultRawTtlMinutes > 0,
    budget.storage.cleanupIntervalMinutes > 0,
    budget.queue.maxItems > 0,
    budget.queue.drainBatchSize > 0,
    budget.queue.dropRawPayloadsFirst,
    budget.provider.maxRequestsPerHour > 0,
    budget.provider.maxInputCharsPerRequest > 0,
    budget.provider.maxTokensPerHour > 0,
    !budget.provider.allowExternalByDefault
  ].filter((ok) => !ok).length;
  const status = failures === 0 ? "pass" : "fail";
  return {
    id: "resource_budgets",
    status,
    message:
      status === "pass"
        ? "CPU, battery, storage, queue, and provider budgets are configured."
        : "One or more perception resource budgets are missing or unsafe.",
    details: { budget }
  };
}

function cleanupCheck(cleanup: PerceptionCleanupSummary | undefined): ReleaseGateCheck {
  if (!cleanup) {
    return {
      id: "sidecar_cleanup",
      status: "needs_data",
      message: "Run perception sidecar cleanup before final release verification."
    };
  }
  return {
    id: "sidecar_cleanup",
    status: "pass",
    message: "Perception sidecar cleanup is available and reports its result.",
    details: { cleanup }
  };
}

function auditCoverageCheck(auditOperations: string[]): ReleaseGateCheck {
  const present = new Set(auditOperations);
  const missingGroups = requiredAuditOperationGroups
    .filter((group) =>
      group.mode === "all"
        ? group.operations.some((operation) => !present.has(operation))
        : !group.operations.some((operation) => present.has(operation))
    )
    .map((group) => group.id);
  if (auditOperations.length === 0) {
    return {
      id: "audit_review",
      status: "needs_data",
      message: "No audit logs exist yet; run smoke, cleanup, provider, and Handoff checks.",
      details: { requiredGroups: requiredAuditOperationGroups.map((group) => group.id) }
    };
  }
  return {
    id: "audit_review",
    status: missingGroups.length === 0 ? "pass" : "needs_data",
    message:
      missingGroups.length === 0
        ? "Audit log includes perception release-gate operation groups."
        : "Audit log is present but some perception operation groups have not been exercised.",
    details: { missingGroups, operations: auditOperations }
  };
}

function packagingCheck(
  packaging: PerceptionReleaseGateInput["packaging"] | undefined
): ReleaseGateCheck {
  if (!packaging) {
    return {
      id: "packaging_policy",
      status: "needs_data",
      message: "Packaging policy was not provided to the release-gate evaluator."
    };
  }
  const safe =
    packaging.excludesTmp &&
    packaging.excludesFixtures &&
    (packaging.nativeHelperMode === "none" ||
      packaging.nativeHelperMode === "mock" ||
      packaging.nativeHelperMode === "signed");
  return {
    id: "packaging_policy",
    status: safe ? "pass" : "fail",
    message: safe
      ? "Package policy excludes private fixture/tmp data and has no silently trusted unsigned helper."
      : "Package policy can include private data or an unsigned native helper.",
    details: { packaging }
  };
}
