import {
  getProtectedObservationMatch,
  type PerceptionControlPlaneStatus,
  type PerceptionResourceState,
  type ProtectedAppRule,
  type ProtectedObservationMatch
} from "@orbit/core";
import {
  captureScreenBurst,
  type ScreenCaptureBurst,
  type ScreenCaptureBurstAuditEntry,
  type ScreenCaptureBurstTrigger
} from "./screenCaptureBurst";
import type { ScreenCaptureNativeHelper, ScreenCaptureScope } from "./screenCaptureTypes";

export type ScreenBurstSchedulerSkipReason =
  | "runtime_paused"
  | "permission_missing"
  | "resource_limited"
  | "protected_app"
  | "interval_not_due";

export type ScreenBurstSchedulerStatus = "completed" | "partial" | "skipped" | "failed";

export interface ScreenBurstSchedulerAuditEntry {
  operation:
    | ScreenCaptureBurstAuditEntry["operation"]
    | "perception.burst_scheduled"
    | "perception.burst_cancelled";
  reason?: ScreenBurstSchedulerSkipReason | ScreenCaptureBurstAuditEntry["reason"];
  frameId?: string;
  frameIndex?: number;
  protectedRuleId?: string;
  protectedReason?: string;
  protectedContentDropped?: number;
}

interface ScreenBurstSchedulerSkip {
  reason: ScreenBurstSchedulerSkipReason;
  protectedMatch?: ProtectedObservationMatch;
  protectedContentDropped?: number;
}

export interface RunScreenBurstSchedulerInput {
  helper: ScreenCaptureNativeHelper;
  perception: PerceptionControlPlaneStatus;
  scope: ScreenCaptureScope;
  runtimeSessionId: string;
  trigger: ScreenCaptureBurstTrigger;
  resourceState: PerceptionResourceState;
  protectedApps?: ProtectedAppRule[];
  lastBurstAt?: string;
  now?: () => Date;
  readPerception?: () => PerceptionControlPlaneStatus;
  readResourceState?: () => PerceptionResourceState;
}

export interface ScreenBurstSchedulerResult {
  status: ScreenBurstSchedulerStatus;
  skipReason?: ScreenBurstSchedulerSkipReason | ScreenCaptureBurst["skipReason"];
  burst?: ScreenCaptureBurst;
  audit: ScreenBurstSchedulerAuditEntry[];
  nextEligibleAt?: string;
}

export async function runScreenBurstScheduler(
  input: RunScreenBurstSchedulerInput
): Promise<ScreenBurstSchedulerResult> {
  const now = input.now ?? (() => new Date());
  const nowDate = now();
  const nextEligibleAt = input.lastBurstAt
    ? addMs(input.lastBurstAt, input.perception.samplingPolicy.minimumBurstIntervalSeconds * 1000)
    : undefined;

  const initialSkip = checkEligibility(input.perception, input.resourceState);
  if (initialSkip) return skipped(initialSkip, nextEligibleAt);

  if (nextEligibleAt && nextEligibleAt > nowDate.toISOString()) {
    return skipped({ reason: "interval_not_due" }, nextEligibleAt);
  }

  const scheduled: ScreenBurstSchedulerAuditEntry = {
    operation: "perception.burst_scheduled"
  };
  const beforeCapturePerception = input.readPerception?.() ?? input.perception;
  const beforeCaptureResource = input.readResourceState?.() ?? input.resourceState;
  const beforeCaptureSkip = checkEligibility(beforeCapturePerception, beforeCaptureResource);
  if (beforeCaptureSkip) {
    return skipped(beforeCaptureSkip, nextEligibleAt, [scheduled]);
  }

  const burst = await captureScreenBurst({
    helper: input.helper,
    scope: input.scope,
    runtimeSessionId: input.runtimeSessionId,
    trigger: input.trigger,
    frameCount: input.perception.samplingPolicy.framesPerBurst,
    frameSpacingMs: input.perception.samplingPolicy.frameSpacingMs,
    protectedApps: input.protectedApps ?? input.perception.protectedApps,
    allowRawFrameStorage: input.perception.samplingPolicy.rawFrameRetention === "short_ttl",
    now
  });
  return {
    status: burst.status,
    ...(burst.skipReason ? { skipReason: burst.skipReason } : {}),
    burst,
    audit: [scheduled, ...burst.audit],
    nextEligibleAt: addMs(nowDate.toISOString(), input.perception.samplingPolicy.minimumBurstIntervalSeconds * 1000)
  };

  function skipped(
    skip: ScreenBurstSchedulerSkip,
    eligibleAt: string | undefined,
    auditPrefix: ScreenBurstSchedulerAuditEntry[] = []
  ): ScreenBurstSchedulerResult {
    const audit: ScreenBurstSchedulerAuditEntry = {
      operation: "perception.burst_skipped",
      reason: skip.reason
    };
    if (skip.protectedMatch) {
      audit.protectedRuleId = skip.protectedMatch.ruleId;
      audit.protectedReason = skip.protectedMatch.reason;
      audit.protectedContentDropped = skip.protectedContentDropped ?? 0;
    }
    return {
      status: "skipped",
      skipReason: skip.reason,
      audit: [...auditPrefix, audit],
      ...(eligibleAt ? { nextEligibleAt: eligibleAt } : {})
    };
  }

  function checkEligibility(
    perception: PerceptionControlPlaneStatus,
    resourceState: PerceptionResourceState
  ): ScreenBurstSchedulerSkip | undefined {
    if (
      perception.dogfoodRuntime.state === "paused_user" ||
      perception.dogfoodRuntime.state === "stopped"
    ) {
      return { reason: "runtime_paused" };
    }
    if (
      perception.dogfoodRuntime.state === "needs_permission" ||
      perception.dogfoodRuntime.permission !== "granted"
    ) {
      return { reason: "permission_missing" };
    }
    if (perception.dogfoodRuntime.state === "paused_resource" || !resourceState.canCapture) {
      return { reason: "resource_limited" };
    }
    const protectedMatch = getProtectedScopeMatch(
      input.scope,
      input.protectedApps ?? perception.protectedApps
    );
    if (perception.dogfoodRuntime.state === "protected" || protectedMatch) {
      return {
        reason: "protected_app",
        ...(protectedMatch ? { protectedMatch, protectedContentDropped: 0 } : {})
      };
    }
    return undefined;
  }
}

function getProtectedScopeMatch(
  scope: ScreenCaptureScope,
  protectedApps: ProtectedAppRule[] | undefined
): ProtectedObservationMatch | undefined {
  if (!scope.appBundleId && !scope.appName && scope.kind === "display") return undefined;
  return getProtectedObservationMatch(
    {
      type: "screen_observation",
      tier: "tier3",
      sourceKind: "screen",
      occurredAt: new Date(0).toISOString(),
      runtimeSessionId: "scheduler-scope-check",
      sequence: 0,
      app: {
        name: scope.appName ?? scope.label,
        ...(scope.appBundleId ? { bundleId: scope.appBundleId } : {})
      },
      ...(scope.kind !== "display" && scope.label
        ? {
            window: {
              title: scope.label
            }
          }
        : {}),
      screen: {
        scopeKind: scope.kind,
        scopeLabel: scope.label,
        frameHash: "scheduler-scope-check"
      }
    },
    protectedApps
  );
}

function addMs(timestamp: string, ms: number): string {
  return new Date(new Date(timestamp).getTime() + ms).toISOString();
}
