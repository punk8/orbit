import type { ObservationPermissionStatus } from "@orbit/core";
import type {
  AudioCaptureBudget,
  AudioCaptureNativeHelper,
  AudioCaptureScope,
  AudioSegment
} from "./audioCaptureTypes";
import { audioPermission } from "./audioCaptureTypes";

export interface MockAudioCaptureNativeHelperOptions {
  segments: AudioSegment[];
  permission?: ObservationPermissionStatus;
}

export class MockAudioCaptureNativeHelper implements AudioCaptureNativeHelper {
  private readonly permission: ObservationPermissionStatus;

  constructor(private readonly options: MockAudioCaptureNativeHelperOptions) {
    this.permission =
      options.permission ??
      audioPermission(
        options.segments[0]?.scope.kind === "system_audio" ? "system_audio" : "microphone",
        "granted"
      );
  }

  async getAudioPermission(): Promise<ObservationPermissionStatus> {
    return this.permission;
  }

  async captureSegments(
    scope: AudioCaptureScope,
    budget: AudioCaptureBudget
  ): Promise<AudioSegment[]> {
    return this.options.segments
      .filter((segment) => audioScopesMatch(segment.scope, scope))
      .filter((segment) => segment.durationMs <= budget.maxSegmentMs)
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
      .map((segment) => ({
        ...segment,
        scope: { ...segment.scope },
        ...(segment.app ? { app: { ...segment.app } } : {})
      }));
  }
}

export function audioScopesMatch(
  segmentScope: AudioCaptureScope,
  requestedScope: AudioCaptureScope
): boolean {
  if (segmentScope.kind !== requestedScope.kind) return false;
  if (requestedScope.deviceId) return segmentScope.deviceId === requestedScope.deviceId;
  if (requestedScope.appBundleId) return segmentScope.appBundleId === requestedScope.appBundleId;
  if (requestedScope.appName) {
    return normalize(segmentScope.appName) === normalize(requestedScope.appName);
  }
  return normalize(segmentScope.label) === normalize(requestedScope.label);
}

function normalize(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}
