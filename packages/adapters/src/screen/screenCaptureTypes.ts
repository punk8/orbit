import type { ObservationPermissionStatus } from "@orbit/core";

export type ScreenCaptureScopeKind = "display" | "app" | "window" | "region";

export interface ScreenCaptureScope {
  kind: ScreenCaptureScopeKind;
  label: string;
  displayId?: string;
  appBundleId?: string;
  appName?: string;
  windowId?: string;
  region?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface ScreenCaptureFrame {
  id: string;
  capturedAt: string;
  runtimeSessionId: string;
  sequence: number;
  scope: ScreenCaptureScope;
  app?: {
    name: string;
    bundleId?: string;
    pid?: number;
    isProtected?: boolean;
  };
  window?: {
    title?: string;
    titleHash?: string;
    isPrivate?: boolean;
  };
  width?: number;
  height?: number;
  frameHash: string;
  redactedSummary?: string;
  rawLocalRef?: string;
  sizeBytes?: number;
  ocrText?: string;
}

export interface ScreenCaptureNativeHelper {
  getScreenRecordingPermission(): Promise<ObservationPermissionStatus>;
  listScopes(): Promise<ScreenCaptureScope[]>;
  captureFrames(
    scope: ScreenCaptureScope,
    budget: ScreenCaptureBudget
  ): Promise<ScreenCaptureFrame[]>;
}

export interface ScreenCaptureBudget {
  maxFrames: number;
  minIntervalMs: number;
}

export function screenPermission(
  status: ObservationPermissionStatus["status"]
): ObservationPermissionStatus {
  return {
    kind: "screen",
    requiredFor: ["screen", "ocr"],
    status,
    canRequestFromApp: true,
    instructions: "Grant macOS Screen Recording permission before screen/OCR capture."
  };
}
