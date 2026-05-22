import {
  isProtectedObservation,
  type ProtectedAppRule
} from "@orbit/core";
import type {
  ScreenCaptureBudget,
  ScreenCaptureFrame,
  ScreenCaptureNativeHelper,
  ScreenCaptureScope
} from "./screenCaptureTypes";
import { frameToScreenObservationInput } from "./screenObservationAdapter";

export type ScreenCaptureBurstTrigger = "manual" | "timer" | "app_window_change";
export type ScreenCaptureBurstStatus = "completed" | "partial" | "skipped" | "failed";
export type ScreenCaptureBurstSkipReason =
  | "permission_missing"
  | "protected_app"
  | "no_frames"
  | "capture_failed";

export interface ScreenCaptureBurstAuditEntry {
  operation:
    | "perception.burst_started"
    | "perception.burst_completed"
    | "perception.burst_skipped"
    | "perception.burst_failed"
    | "perception.frame_captured";
  reason?: ScreenCaptureBurstSkipReason;
  frameId?: string;
  frameIndex?: number;
}

export interface ScreenCaptureBurstFrame {
  frame: ScreenCaptureFrame;
  frameIndex: number;
  rawStored: boolean;
  duplicateOfFrameId?: string;
}

export interface ScreenCaptureBurst {
  id: string;
  runtimeSessionId: string;
  trigger: ScreenCaptureBurstTrigger;
  scope: ScreenCaptureScope;
  startedAt: string;
  endedAt: string;
  status: ScreenCaptureBurstStatus;
  skipReason?: ScreenCaptureBurstSkipReason;
  frames: ScreenCaptureBurstFrame[];
  audit: ScreenCaptureBurstAuditEntry[];
}

export interface CaptureScreenBurstOptions {
  helper: ScreenCaptureNativeHelper;
  scope: ScreenCaptureScope;
  runtimeSessionId: string;
  trigger: ScreenCaptureBurstTrigger;
  frameCount: number;
  frameSpacingMs: number;
  protectedApps?: ProtectedAppRule[];
  allowRawFrameStorage?: boolean;
  now?: () => Date;
}

export async function captureScreenBurst(
  options: CaptureScreenBurstOptions
): Promise<ScreenCaptureBurst> {
  const now = options.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const id = `burst_${options.runtimeSessionId}_${startedAt.replaceAll(/[^0-9A-Za-z]/g, "")}`;
  const protectedReason = protectedScopeReason(options.scope, options.protectedApps);
  if (protectedReason) {
    return skippedBurst(options, id, startedAt, now().toISOString(), "protected_app");
  }

  const permission = await options.helper.getScreenRecordingPermission();
  if (permission.status !== "granted" && permission.status !== "not_required") {
    return skippedBurst(options, id, startedAt, now().toISOString(), "permission_missing");
  }

  const audit: ScreenCaptureBurstAuditEntry[] = [{ operation: "perception.burst_started" }];
  const frames: ScreenCaptureBurstFrame[] = [];
  try {
    const capturedFrames = await options.helper.captureFrames(options.scope, burstBudget(options));
    for (const frame of capturedFrames.slice(0, options.frameCount)) {
      if (isProtectedFrame(frame, options.protectedApps)) continue;
      const frameIndex = frames.length;
      frames.push({
        frame: {
          ...frame,
          runtimeSessionId: options.runtimeSessionId,
          sequence: frameIndex + 1
        },
        frameIndex,
        rawStored: options.allowRawFrameStorage === true && Boolean(frame.rawLocalRef)
      });
      audit.push({
        operation: "perception.frame_captured",
        frameId: frame.id,
        frameIndex
      });
    }
  } catch {
    audit.push({ operation: "perception.burst_failed", reason: "capture_failed" });
    return {
      id,
      runtimeSessionId: options.runtimeSessionId,
      trigger: options.trigger,
      scope: cloneScope(options.scope),
      startedAt,
      endedAt: now().toISOString(),
      status: "failed",
      skipReason: "capture_failed",
      frames,
      audit
    };
  }

  if (frames.length === 0) {
    audit.push({ operation: "perception.burst_skipped", reason: "no_frames" });
    return {
      id,
      runtimeSessionId: options.runtimeSessionId,
      trigger: options.trigger,
      scope: cloneScope(options.scope),
      startedAt,
      endedAt: now().toISOString(),
      status: "skipped",
      skipReason: "no_frames",
      frames,
      audit
    };
  }

  audit.push({ operation: "perception.burst_completed" });
  return {
    id,
    runtimeSessionId: options.runtimeSessionId,
    trigger: options.trigger,
    scope: cloneScope(options.scope),
    startedAt,
    endedAt: now().toISOString(),
    status: frames.length === options.frameCount ? "completed" : "partial",
    frames,
    audit
  };
}

function skippedBurst(
  options: CaptureScreenBurstOptions,
  id: string,
  startedAt: string,
  endedAt: string,
  reason: ScreenCaptureBurstSkipReason
): ScreenCaptureBurst {
  return {
    id,
    runtimeSessionId: options.runtimeSessionId,
    trigger: options.trigger,
    scope: cloneScope(options.scope),
    startedAt,
    endedAt,
    status: "skipped",
    skipReason: reason,
    frames: [],
    audit: [{ operation: "perception.burst_skipped", reason }]
  };
}

function burstBudget(options: CaptureScreenBurstOptions): ScreenCaptureBudget {
  return {
    maxFrames: options.frameCount,
    minIntervalMs: options.frameSpacingMs
  };
}

function protectedScopeReason(
  scope: ScreenCaptureScope,
  protectedApps: ProtectedAppRule[] | undefined
): boolean {
  if (!scope.appBundleId && !scope.appName) return false;
  return isProtectedObservation(
    {
      type: "screen_observation",
      tier: "tier3",
      sourceKind: "screen",
      occurredAt: new Date(0).toISOString(),
      runtimeSessionId: "scope-check",
      sequence: 0,
      app: {
        name: scope.appName ?? scope.label,
        ...(scope.appBundleId ? { bundleId: scope.appBundleId } : {})
      },
      screen: {
        scopeKind: scope.kind,
        scopeLabel: scope.label,
        frameHash: "scope-check"
      }
    },
    protectedApps
  );
}

function isProtectedFrame(
  frame: ScreenCaptureFrame,
  protectedApps: ProtectedAppRule[] | undefined
): boolean {
  return isProtectedObservation(frameToScreenObservationInput(frame), protectedApps);
}

function cloneScope(scope: ScreenCaptureScope): ScreenCaptureScope {
  const result: ScreenCaptureScope = {
    kind: scope.kind,
    label: scope.label
  };
  if (scope.displayId) result.displayId = scope.displayId;
  if (scope.appBundleId) result.appBundleId = scope.appBundleId;
  if (scope.appName) result.appName = scope.appName;
  if (scope.windowId) result.windowId = scope.windowId;
  if (scope.region) result.region = { ...scope.region };
  return result;
}
