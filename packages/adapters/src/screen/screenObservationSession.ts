import type {
  ScreenCaptureBudget,
  ScreenCaptureFrame,
  ScreenCaptureNativeHelper,
  ScreenCaptureScope
} from "./screenCaptureTypes";

export type ScreenObservationSessionStatus = "ready" | "collecting" | "paused" | "stopped";

export interface ScreenObservationSessionOptions {
  helper: ScreenCaptureNativeHelper;
  scope: ScreenCaptureScope;
  budget?: ScreenCaptureBudget;
}

export interface ScreenObservationSessionSnapshot {
  status: ScreenObservationSessionStatus;
  scope: ScreenCaptureScope;
  capturedFrames: number;
}

export class ScreenObservationSession {
  private status: ScreenObservationSessionStatus = "ready";
  private capturedFrames = 0;
  private readonly budget: ScreenCaptureBudget;

  constructor(private readonly options: ScreenObservationSessionOptions) {
    this.budget = options.budget ?? { maxFrames: 1, minIntervalMs: 30_000 };
  }

  snapshot(): ScreenObservationSessionSnapshot {
    return {
      status: this.status,
      scope: cloneScope(this.options.scope),
      capturedFrames: this.capturedFrames
    };
  }

  async start(): Promise<ScreenObservationSessionSnapshot> {
    const permission = await this.options.helper.getScreenRecordingPermission();
    if (permission.status !== "granted" && permission.status !== "not_required") {
      throw new Error(`Screen observation needs Screen Recording permission: ${permission.status}`);
    }
    this.status = "collecting";
    return this.snapshot();
  }

  pause(): ScreenObservationSessionSnapshot {
    if (this.status === "collecting") this.status = "paused";
    return this.snapshot();
  }

  resume(): ScreenObservationSessionSnapshot {
    if (this.status === "paused") this.status = "collecting";
    return this.snapshot();
  }

  stop(): ScreenObservationSessionSnapshot {
    this.status = "stopped";
    return this.snapshot();
  }

  async captureOnce(): Promise<ScreenCaptureFrame[]> {
    if (this.status !== "collecting") return [];
    const frames = await this.options.helper.captureFrames(this.options.scope, this.budget);
    this.capturedFrames += frames.length;
    return frames;
  }
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
