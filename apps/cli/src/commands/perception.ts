import {
  MockScreenCaptureNativeHelper,
  ScreenObservationSession,
  type ScreenCaptureScope,
  screenPermission
} from "@orbit/adapters";
import { openOrbitDatabase, readPerceptionStatus } from "@orbit/db";
import { getCliConfig } from "../config";
import type { PerceptionControlPlaneStatus } from "@orbit/core";

export interface PerceptionStatusResult {
  orbitHome: string;
  dbPath: string;
  perception: PerceptionControlPlaneStatus;
}

export interface ScreenOcrSmokeResult {
  scope: ScreenCaptureScope;
  transitions: Array<{
    action: "start" | "capture" | "pause" | "resume" | "stop";
    status: string;
    capturedFrames: number;
  }>;
}

export function getPerceptionStatus(): PerceptionStatusResult {
  const config = getCliConfig();
  const database = openOrbitDatabase({ orbitHome: config.orbitHome });
  try {
    return {
      orbitHome: database.orbitHome,
      dbPath: database.dbPath,
      perception: readPerceptionStatus(database.db)
    };
  } finally {
    database.close();
  }
}

export async function runScreenOcrSmoke(
  scopeKind: ScreenCaptureScope["kind"]
): Promise<ScreenOcrSmokeResult> {
  const scope = smokeScope(scopeKind);
  const helper = new MockScreenCaptureNativeHelper({
    permission: screenPermission("granted"),
    frames: [
      {
        id: "smoke_frame_1",
        capturedAt: new Date("2026-05-21T00:00:00.000Z").toISOString(),
        runtimeSessionId: "screen-ocr-smoke",
        sequence: 1,
        scope,
        app: {
          name: "Orbit",
          bundleId: "app.orbit.local"
        },
        window: {
          title: "Orbit Screen/OCR Smoke"
        },
        width: 1280,
        height: 720,
        frameHash: "smoke_frame_hash_1",
        redactedSummary: "Mock screen/OCR smoke frame."
      }
    ]
  });
  const session = new ScreenObservationSession({
    helper,
    scope,
    budget: {
      maxFrames: 1,
      minIntervalMs: 30_000
    }
  });

  const transitions: ScreenOcrSmokeResult["transitions"] = [];
  const started = await session.start();
  transitions.push({
    action: "start",
    status: started.status,
    capturedFrames: started.capturedFrames
  });
  const captured = await session.captureOnce();
  transitions.push({
    action: "capture",
    status: session.snapshot().status,
    capturedFrames: captured.length
  });
  const paused = session.pause();
  transitions.push({
    action: "pause",
    status: paused.status,
    capturedFrames: paused.capturedFrames
  });
  const resumed = session.resume();
  transitions.push({
    action: "resume",
    status: resumed.status,
    capturedFrames: resumed.capturedFrames
  });
  const stopped = session.stop();
  transitions.push({
    action: "stop",
    status: stopped.status,
    capturedFrames: stopped.capturedFrames
  });

  return { scope, transitions };
}

function smokeScope(kind: ScreenCaptureScope["kind"]): ScreenCaptureScope {
  if (kind === "app") {
    return {
      kind,
      label: "Orbit",
      appName: "Orbit",
      appBundleId: "app.orbit.local"
    };
  }
  if (kind === "window") {
    return {
      kind,
      label: "Orbit Screen/OCR Smoke",
      windowId: "orbit-smoke-window"
    };
  }
  if (kind === "region") {
    return {
      kind,
      label: "Orbit Smoke Region",
      region: {
        x: 0,
        y: 0,
        width: 800,
        height: 600
      }
    };
  }
  return {
    kind: "display",
    label: "Fixture Display",
    displayId: "fixture-display"
  };
}
