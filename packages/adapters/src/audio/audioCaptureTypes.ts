import type { ObservationPermissionStatus } from "@orbit/core";

export type AudioCaptureScopeKind = "microphone" | "system_audio" | "mixed";

export interface AudioCaptureScope {
  kind: AudioCaptureScopeKind;
  label: string;
  deviceId?: string;
  appName?: string;
  appBundleId?: string;
}

export interface AudioSegment {
  id: string;
  startedAt: string;
  endedAt: string;
  runtimeSessionId: string;
  sequence: number;
  scope: AudioCaptureScope;
  app?: {
    name: string;
    bundleId?: string;
    pid?: number;
    isProtected?: boolean;
  };
  segmentHash: string;
  durationMs: number;
  redactedSummary?: string;
  transcriptText?: string;
  transcriptLanguage?: string;
  transcriptConfidence?: number;
  redactionState?: "none" | "redacted" | "failed";
  rawLocalRef?: string;
  sizeBytes?: number;
}

export interface AudioCaptureBudget {
  maxSegmentMs: number;
  minVoiceMs: number;
}

export interface AudioCaptureNativeHelper {
  getAudioPermission(scope: AudioCaptureScope): Promise<ObservationPermissionStatus>;
  captureSegments(scope: AudioCaptureScope, budget: AudioCaptureBudget): Promise<AudioSegment[]>;
}

export function audioPermission(
  kind: Extract<ObservationPermissionStatus["kind"], "microphone" | "system_audio">,
  status: ObservationPermissionStatus["status"]
): ObservationPermissionStatus {
  return {
    kind,
    requiredFor: kind === "microphone" ? ["audio", "transcript"] : ["audio"],
    status,
    canRequestFromApp: kind === "microphone",
    instructions:
      kind === "microphone"
        ? "Grant macOS Microphone permission before meeting/session capture."
        : "System audio support depends on the selected macOS capture path."
  };
}
