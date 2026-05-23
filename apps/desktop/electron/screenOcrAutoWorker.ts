import type { DesktopActionResult, DesktopSnapshot } from "../src/orbitApi";

export type ScreenOcrAutoCaptureTickStatus = "captured" | "skipped" | "failed";
export type ScreenOcrAutoCaptureSkipReason =
  | "already_running"
  | "collection_paused"
  | "runtime_not_observing"
  | "capture_failed";

export interface ScreenOcrAutoCaptureTickResult {
  status: ScreenOcrAutoCaptureTickStatus;
  reason?: ScreenOcrAutoCaptureSkipReason;
  result?: DesktopActionResult;
}

export interface ScreenOcrAutoCaptureTickOptions {
  readSnapshot: () => DesktopSnapshot;
  captureBurst: () => Promise<DesktopActionResult>;
  isRunning?: () => boolean;
  setRunning?: (running: boolean) => void;
}

export async function runScreenOcrAutoCaptureTick(
  options: ScreenOcrAutoCaptureTickOptions
): Promise<ScreenOcrAutoCaptureTickResult> {
  if (options.isRunning?.() === true) {
    return { status: "skipped", reason: "already_running" };
  }

  const snapshot = options.readSnapshot();
  if (snapshot.runtime.collectionPaused) {
    return { status: "skipped", reason: "collection_paused" };
  }
  if (snapshot.perception.dogfoodRuntime.state !== "observing") {
    return { status: "skipped", reason: "runtime_not_observing" };
  }

  options.setRunning?.(true);
  try {
    const result = await options.captureBurst();
    return { status: "captured", result };
  } catch {
    return { status: "failed", reason: "capture_failed" };
  } finally {
    options.setRunning?.(false);
  }
}
