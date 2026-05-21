import type { ObservationPermissionStatus } from "@orbit/core";
import type {
  ScreenCaptureBudget,
  ScreenCaptureFrame,
  ScreenCaptureNativeHelper,
  ScreenCaptureScope
} from "./screenCaptureTypes";
import { screenPermission } from "./screenCaptureTypes";

export interface MockScreenCaptureNativeHelperOptions {
  frames: ScreenCaptureFrame[];
  permission?: ObservationPermissionStatus;
  scopes?: ScreenCaptureScope[];
}

export class MockScreenCaptureNativeHelper implements ScreenCaptureNativeHelper {
  private readonly permission: ObservationPermissionStatus;
  private readonly scopes: ScreenCaptureScope[];

  constructor(private readonly options: MockScreenCaptureNativeHelperOptions) {
    this.permission = options.permission ?? screenPermission("granted");
    this.scopes = options.scopes ?? uniqueScopes(options.frames.map((frame) => frame.scope));
  }

  async getScreenRecordingPermission(): Promise<ObservationPermissionStatus> {
    return this.permission;
  }

  async listScopes(): Promise<ScreenCaptureScope[]> {
    return this.scopes.map((scope) => cloneScope(scope));
  }

  async captureFrames(
    scope: ScreenCaptureScope,
    budget: ScreenCaptureBudget
  ): Promise<ScreenCaptureFrame[]> {
    const matching = this.options.frames
      .filter((frame) => scopesMatch(frame.scope, scope))
      .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
      .slice(0, budget.maxFrames);
    return matching.map((frame) => ({
      id: frame.id,
      capturedAt: frame.capturedAt,
      runtimeSessionId: frame.runtimeSessionId,
      sequence: frame.sequence,
      scope: cloneScope(frame.scope),
      frameHash: frame.frameHash,
      ...(frame.app ? { app: { ...frame.app } } : {}),
      ...(frame.window ? { window: { ...frame.window } } : {}),
      ...(frame.width ? { width: frame.width } : {}),
      ...(frame.height ? { height: frame.height } : {}),
      ...(frame.redactedSummary ? { redactedSummary: frame.redactedSummary } : {}),
      ...(frame.rawLocalRef ? { rawLocalRef: frame.rawLocalRef } : {}),
      ...(frame.sizeBytes ? { sizeBytes: frame.sizeBytes } : {}),
      ...(frame.ocrText ? { ocrText: frame.ocrText } : {})
    }));
  }
}

export function scopesMatch(
  frameScope: ScreenCaptureScope,
  requestedScope: ScreenCaptureScope
): boolean {
  if (requestedScope.kind === "display") {
    return requestedScope.displayId
      ? frameScope.displayId === requestedScope.displayId
      : frameScope.kind === "display";
  }
  if (requestedScope.kind !== frameScope.kind) return false;
  if (requestedScope.windowId) return frameScope.windowId === requestedScope.windowId;
  if (requestedScope.appBundleId) return frameScope.appBundleId === requestedScope.appBundleId;
  if (requestedScope.appName)
    return normalize(frameScope.appName) === normalize(requestedScope.appName);
  return normalize(frameScope.label) === normalize(requestedScope.label);
}

function uniqueScopes(scopes: ScreenCaptureScope[]): ScreenCaptureScope[] {
  const seen = new Set<string>();
  const result: ScreenCaptureScope[] = [];
  for (const scope of scopes) {
    const key = `${scope.kind}:${scope.displayId ?? ""}:${scope.appBundleId ?? ""}:${
      scope.windowId ?? ""
    }:${scope.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cloneScope(scope));
  }
  return result;
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

function normalize(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}
