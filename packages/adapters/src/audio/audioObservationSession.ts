import type {
  AudioCaptureBudget,
  AudioCaptureNativeHelper,
  AudioCaptureScope,
  AudioSegment
} from "./audioCaptureTypes";

export type AudioObservationSessionStatus = "ready" | "collecting" | "paused" | "stopped";

export interface AudioObservationSessionOptions {
  helper: AudioCaptureNativeHelper;
  scope: AudioCaptureScope;
  budget?: AudioCaptureBudget;
}

export interface AudioObservationSessionSnapshot {
  status: AudioObservationSessionStatus;
  scope: AudioCaptureScope;
  capturedSegments: number;
}

export class AudioObservationSession {
  private status: AudioObservationSessionStatus = "ready";
  private capturedSegments = 0;
  private readonly budget: AudioCaptureBudget;

  constructor(private readonly options: AudioObservationSessionOptions) {
    this.budget = options.budget ?? { maxSegmentMs: 30_000, minVoiceMs: 500 };
  }

  snapshot(): AudioObservationSessionSnapshot {
    return {
      status: this.status,
      scope: { ...this.options.scope },
      capturedSegments: this.capturedSegments
    };
  }

  async start(): Promise<AudioObservationSessionSnapshot> {
    const permission = await this.options.helper.getAudioPermission(this.options.scope);
    if (permission.status !== "granted" && permission.status !== "not_required") {
      throw new Error(
        `${permission.kind} permission is required before audio capture: ${permission.status}`
      );
    }
    this.status = "collecting";
    return this.snapshot();
  }

  pause(): AudioObservationSessionSnapshot {
    if (this.status === "collecting") this.status = "paused";
    return this.snapshot();
  }

  resume(): AudioObservationSessionSnapshot {
    if (this.status === "paused") this.status = "collecting";
    return this.snapshot();
  }

  async flush(): Promise<AudioSegment[]> {
    if (this.status !== "collecting") return [];
    const segments = await this.options.helper.captureSegments(this.options.scope, this.budget);
    this.capturedSegments += segments.length;
    return segments;
  }

  stop(): AudioObservationSessionSnapshot {
    this.status = "stopped";
    return this.snapshot();
  }
}
