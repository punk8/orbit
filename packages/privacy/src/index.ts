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
  nextAction?: string;
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
    privateDataScan?: {
      scanned: number;
      violations: string[];
    };
    nativeHelperMode: "none" | "mock" | "unsigned" | "signed";
    signed: boolean;
    notarized: boolean;
  };
  manualSmoke?: Partial<Record<ManualSmokeScenario, ManualSmokeStatus>>;
}

export interface PerceptionReleaseGateReport {
  status: "pass" | "fail";
  checks: ReleaseGateCheck[];
  auditReview: PerceptionAuditReview;
  manualSmoke: PerceptionManualSmokeReview;
  nextActions: PerceptionReleaseGateNextAction[];
  packaging: {
    excludesTmp: boolean;
    excludesFixtures: boolean;
    privateDataScan: {
      scanned: number;
      violations: string[];
    };
    nativeHelperMode: "none" | "mock" | "unsigned" | "signed" | "unknown";
    signed: boolean;
    notarized: boolean;
  };
}

export interface PerceptionAuditReview {
  operationCounts: Record<string, number>;
  requiredGroups: string[];
  missingGroups: string[];
  dataState: "missing_implementation" | "needs_data" | "partial" | "complete";
}

export type ManualSmokeScenario =
  | "screenRecordingPermission"
  | "autoStart"
  | "pauseResumeStop"
  | "permissionRevoke"
  | "restartAutoResume"
  | "resourcePause"
  | "protectedContext"
  | "auditReview"
  | "cleanup"
  | "handoffExclusion";

export type ManualSmokeStatus = "passed" | "failed" | "needs_data";

export interface PerceptionManualSmokeReview {
  required: ManualSmokeScenario[];
  completed: ManualSmokeScenario[];
  failed: ManualSmokeScenario[];
  missing: ManualSmokeScenario[];
}

export interface PerceptionReleaseGateNextAction {
  id: string;
  severity: "required" | "evidence" | "credentials";
  title: string;
  command?: string;
  docs?: string;
}

const requiredAuditOperationGroups: Array<{
  id: string;
  operations: string[];
  mode: "all" | "any";
}> = [
  {
    id: "permission",
    operations: [
      "perception.permission_checked",
      "perception.permission_granted",
      "perception.permission_revoked"
    ],
    mode: "any"
  },
  {
    id: "runtime",
    operations: [
      "perception.runtime_auto_started",
      "perception.runtime_paused",
      "perception.runtime_resumed",
      "perception.runtime_stopped",
      "perception.source_disabled"
    ],
    mode: "any"
  },
  {
    id: "burst_scheduler",
    operations: [
      "perception.burst_scheduled",
      "perception.burst_started",
      "perception.burst_completed"
    ],
    mode: "all"
  },
  {
    id: "burst_skip_or_failure",
    operations: ["perception.burst_skipped", "perception.burst_failed"],
    mode: "any"
  },
  {
    id: "protected_skip",
    operations: ["perception.protected_context_skipped", "perception.protected_content_dropped"],
    mode: "any"
  },
  {
    id: "resource_pause",
    operations: ["perception.resource_paused", "perception.burst_skipped"],
    mode: "any"
  },
  { id: "redaction_failure", operations: ["perception.redaction_failure"], mode: "any" },
  {
    id: "cleanup",
    operations: [
      "perception.sidecar_cleanup",
      "perception.events_delete",
      "perception.evidence_unavailable"
    ],
    mode: "any"
  },
  {
    id: "knowledge_generated_or_suppressed",
    operations: ["knowledge.generated", "knowledge.suppressed", "ai.draft_knowledge.skipped"],
    mode: "any"
  },
  {
    id: "handoff_included_or_excluded",
    operations: ["handoff.generate"],
    mode: "any"
  }
];

const requiredManualSmokeScenarios: ManualSmokeScenario[] = [
  "screenRecordingPermission",
  "autoStart",
  "pauseResumeStop",
  "permissionRevoke",
  "restartAutoResume",
  "resourcePause",
  "protectedContext",
  "auditReview",
  "cleanup",
  "handoffExclusion"
];

export function evaluatePerceptionReleaseGate(
  input: PerceptionReleaseGateInput
): PerceptionReleaseGateReport {
  const auditReview = buildAuditReview(input.auditOperations);
  const manualSmoke = buildManualSmokeReview(input.manualSmoke);
  const packaging = buildPackagingSummary(input.packaging);
  const checks = [
    noDefaultCaptureCheck(input.perception),
    rawStorageDefaultOffCheck(input.perception),
    protectedAppsCheck(input.perception),
    resourceBudgetCheck(input.perception),
    cleanupCheck(input.cleanup),
    auditCoverageCheck(auditReview),
    manualSmokeCheck(manualSmoke),
    packagingCheck(input.packaging)
  ];
  const nextActions = buildReleaseGateNextActions({
    auditReview,
    manualSmoke,
    packagingCheck: checks.find((check) => check.id === "packaging_policy")
  });
  return {
    status: checks.some((check) => check.status === "fail") ? "fail" : "pass",
    checks,
    auditReview,
    manualSmoke,
    nextActions,
    packaging
  };
}

function noDefaultCaptureCheck(perception: PerceptionControlPlaneStatus): ReleaseGateCheck {
  const enabledSources = perception.sources
    .filter((source) => source.enabled)
    .map((source) => source.sourceKind);
  const enabledProviders = perception.providerRoutes
    .filter((route) => route.enabled || route.allowExternal)
    .map((route) => route.task);
  const dogfoodAutoStart =
    perception.dogfoodRuntime.state === "observing" &&
    perception.dogfoodRuntime.permission === "granted" &&
    enabledSources.length > 0 &&
    enabledSources.every((sourceKind) => sourceKind === "screen" || sourceKind === "ocr") &&
    perception.sources
      .filter((source) => source.enabled)
      .every((source) => source.userIntent === "auto");
  const status =
    (enabledSources.length === 0 || dogfoodAutoStart) && enabledProviders.length === 0
      ? "pass"
      : "fail";
  return {
    id: "no_default_capture",
    status,
    message:
      status === "pass"
        ? dogfoodAutoStart
          ? "Screen/OCR dogfood runtime starts only after Screen Recording permission is granted."
          : "All high-risk perception sources and provider routes are disabled by default."
        : "Perception capture or provider routes are enabled by default.",
    details: { enabledSources, enabledProviders, dogfoodAutoStart }
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

function auditCoverageCheck(auditReview: PerceptionAuditReview): ReleaseGateCheck {
  if (auditReview.dataState === "missing_implementation") {
    return {
      id: "audit_review",
      status: "fail",
      message: "Audit review data was not provided to the release-gate evaluator.",
      nextAction: "wire_release_gate_audit_review",
      details: { auditReview }
    };
  }
  if (Object.keys(auditReview.operationCounts).length === 0) {
    return {
      id: "audit_review",
      status: "needs_data",
      message: "No audit logs exist yet; run smoke, cleanup, provider, and Handoff checks.",
      nextAction: "exercise_source_install_audit_smoke",
      details: { auditReview }
    };
  }
  return {
    id: "audit_review",
    status: auditReview.missingGroups.length === 0 ? "pass" : "needs_data",
    message:
      auditReview.missingGroups.length === 0
        ? "Audit log includes perception release-gate operation groups."
        : "Audit log is present but some perception operation groups have not been exercised.",
    ...(auditReview.missingGroups.length === 0
      ? {}
      : { nextAction: "exercise_missing_audit_groups" }),
    details: { auditReview }
  };
}

function manualSmokeCheck(manualSmoke: PerceptionManualSmokeReview): ReleaseGateCheck {
  if (manualSmoke.failed.length > 0) {
    return {
      id: "manual_smoke",
      status: "fail",
      message: "One or more required Alpha dogfood manual smoke scenarios failed.",
      nextAction: "rerun_failed_manual_smoke",
      details: { manualSmoke }
    };
  }
  if (manualSmoke.missing.length > 0) {
    return {
      id: "manual_smoke",
      status: "needs_data",
      message: "Some required Alpha dogfood manual smoke scenarios still need real macOS evidence.",
      nextAction: "record_source_install_manual_smoke",
      details: { manualSmoke }
    };
  }
  return {
    id: "manual_smoke",
    status: "pass",
    message: "Required Alpha dogfood manual smoke scenarios have been recorded.",
    details: { manualSmoke }
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
  const privateDataSafe =
    packaging.excludesTmp &&
    packaging.excludesFixtures &&
    (packaging.privateDataScan?.violations.length ?? 0) === 0;
  const signedHelperSafe =
    packaging.nativeHelperMode === "none" ||
    packaging.nativeHelperMode === "mock" ||
    packaging.nativeHelperMode === "signed";
  const unsignedAlphaHelper = privateDataSafe && packaging.nativeHelperMode === "unsigned";
  const safe = privateDataSafe && signedHelperSafe;
  return {
    id: "packaging_policy",
    status: safe ? "pass" : unsignedAlphaHelper ? "needs_data" : "fail",
    message: safe
      ? "Package policy excludes private fixture/tmp data and has no silently trusted unsigned helper."
      : unsignedAlphaHelper
        ? "Alpha package uses an unsigned native helper; signing and notarization require Apple Developer credentials."
        : "Package policy can include private data or an unsigned native helper.",
    ...(safe
      ? {}
      : {
          nextAction: unsignedAlphaHelper
            ? "provide_apple_developer_credentials"
            : "fix_packaging_private_data_or_helper"
        }),
    details: {
      packaging,
      ...(unsignedAlphaHelper
        ? { signingBlocker: "missing_apple_developer_credentials" }
        : {})
    }
  };
}

function buildReleaseGateNextActions(input: {
  auditReview: PerceptionAuditReview;
  manualSmoke: PerceptionManualSmokeReview;
  packagingCheck: ReleaseGateCheck | undefined;
}): PerceptionReleaseGateNextAction[] {
  const actions: PerceptionReleaseGateNextAction[] = [];
  if (input.manualSmoke.failed.length > 0) {
    actions.push({
      id: "manual_smoke.rerun_failed",
      severity: "required",
      title: `Rerun failed source-install manual smoke checks: ${input.manualSmoke.failed.join(", ")}.`,
      command: `ORBIT_ALPHA_MANUAL_SMOKE="${manualSmokeEnvExample()}" pnpm --filter @orbit/cli orbit perception release-gate --json`,
      docs: "docs/source-install-manual-smoke.md"
    });
  } else if (input.manualSmoke.missing.length > 0) {
    actions.push({
      id: "manual_smoke.record_evidence",
      severity: "evidence",
      title: `Record source-install manual smoke evidence for: ${input.manualSmoke.missing.join(", ")}.`,
      command: `ORBIT_ALPHA_MANUAL_SMOKE="${manualSmokeEnvExample()}" pnpm --filter @orbit/cli orbit perception release-gate --json`,
      docs: "docs/source-install-manual-smoke.md"
    });
  }

  if (input.auditReview.dataState === "missing_implementation") {
    actions.push({
      id: "audit_review.wire_implementation",
      severity: "required",
      title: "Wire audit operations into the release-gate evaluator.",
      docs: "docs/source-install-dogfood-production-spec.md"
    });
  } else if (input.auditReview.missingGroups.length > 0) {
    actions.push({
      id: "audit_review.exercise_missing_groups",
      severity: "evidence",
      title: `Exercise missing audit groups: ${input.auditReview.missingGroups.join(", ")}.`,
      command: "pnpm --filter @orbit/cli orbit perception audit-review --json",
      docs: "docs/source-install-manual-smoke.md"
    });
  }

  if (input.packagingCheck?.details?.signingBlocker === "missing_apple_developer_credentials") {
    actions.push({
      id: "packaging_policy.provide_apple_credentials",
      severity: "credentials",
      title:
        "Provide Apple Developer credentials only when moving beyond source-install dogfood packaging.",
      docs: "docs/source-install-dogfood.md"
    });
  } else if (input.packagingCheck?.status === "fail") {
    actions.push({
      id: "packaging_policy.fix_package",
      severity: "required",
      title: "Fix package private-data exclusions or native helper mode before sharing the build.",
      command: "pnpm --filter @orbit/desktop package:smoke",
      docs: "docs/source-install-dogfood.md"
    });
  }

  return actions;
}

function manualSmokeEnvExample(): string {
  return requiredManualSmokeScenarios
    .map((scenario) => `${scenario}=passed`)
    .join(",");
}

function buildManualSmokeReview(
  manualSmoke: PerceptionReleaseGateInput["manualSmoke"] | undefined
): PerceptionManualSmokeReview {
  const completed: ManualSmokeScenario[] = [];
  const failed: ManualSmokeScenario[] = [];
  const missing: ManualSmokeScenario[] = [];
  for (const scenario of requiredManualSmokeScenarios) {
    const status = manualSmoke?.[scenario] ?? "needs_data";
    if (status === "passed") completed.push(scenario);
    else if (status === "failed") failed.push(scenario);
    else missing.push(scenario);
  }
  return {
    required: requiredManualSmokeScenarios,
    completed,
    failed,
    missing
  };
}

function buildAuditReview(auditOperations: string[] | undefined): PerceptionAuditReview {
  if (!auditOperations) {
    return {
      operationCounts: {},
      requiredGroups: requiredAuditOperationGroups.map((group) => group.id),
      missingGroups: requiredAuditOperationGroups.map((group) => group.id),
      dataState: "missing_implementation"
    };
  }
  const present = new Set(auditOperations);
  const missingGroups = requiredAuditOperationGroups
    .filter((group) =>
      group.mode === "all"
        ? group.operations.some((operation) => !present.has(operation))
        : !group.operations.some((operation) => present.has(operation))
    )
    .map((group) => group.id);
  const operationCounts: Record<string, number> = {};
  for (const operation of auditOperations) {
    operationCounts[operation] = (operationCounts[operation] ?? 0) + 1;
  }
  return {
    operationCounts,
    requiredGroups: requiredAuditOperationGroups.map((group) => group.id),
    missingGroups,
    dataState:
      auditOperations.length === 0
        ? "needs_data"
        : missingGroups.length === 0
          ? "complete"
          : "partial"
  };
}

function buildPackagingSummary(
  packaging: PerceptionReleaseGateInput["packaging"] | undefined
): PerceptionReleaseGateReport["packaging"] {
  return {
    excludesTmp: packaging?.excludesTmp ?? false,
    excludesFixtures: packaging?.excludesFixtures ?? false,
    privateDataScan: packaging?.privateDataScan ?? { scanned: 0, violations: [] },
    nativeHelperMode: packaging?.nativeHelperMode ?? "unknown",
    signed: packaging?.signed ?? false,
    notarized: packaging?.notarized ?? false
  };
}
