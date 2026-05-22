import { describe, expect, it } from "vitest";
import type { Event } from "@orbit/core";
import { defaultProtectedAppRules, ingestEventsFromAdapter } from "@orbit/core";
import { MockOcrEngine } from "./ocr/mockOcrEngine";
import { OcrObservationAdapter } from "./ocr/ocrObservationAdapter";
import { MockScreenCaptureNativeHelper } from "./screen/mockScreenCaptureNativeHelper";
import { captureScreenBurst } from "./screen/screenCaptureBurst";
import { ScreenObservationAdapter } from "./screen/screenObservationAdapter";
import { ScreenObservationSession } from "./screen/screenObservationSession";
import type { ScreenCaptureFrame, ScreenCaptureScope } from "./screen/screenCaptureTypes";
import { screenPermission } from "./screen/screenCaptureTypes";

describe("screen/OCR perception adapters", () => {
  it("requires Screen Recording permission before screen or OCR Events", async () => {
    const denied = screenPermission("denied");
    const screen = await readAdapter(
      new ScreenObservationAdapter({
        frames: [frame("frame_denied")],
        scope: displayScope,
        permission: denied
      })
    );
    const ocr = await readAdapter(
      new OcrObservationAdapter({
        frames: [frame("frame_denied")],
        scope: displayScope,
        engine: new MockOcrEngine(),
        permission: denied
      })
    );

    expect(screen.events).toHaveLength(0);
    expect(screen.result.warnings[0]).toContain("Screen Recording permission");
    expect(ocr.events).toHaveLength(0);
    expect(ocr.result.warnings[0]).toContain("Screen Recording permission");
  });

  it("suppresses protected app frames before screen storage and OCR", async () => {
    const protectedFrame = frame("frame_secret", {
      app: {
        name: "1Password",
        bundleId: "com.1password.1password",
        isProtected: true
      },
      window: {
        title: "API token abc123"
      },
      ocrText: "password=hunter2"
    });
    const options = {
      frames: [protectedFrame],
      scope: displayScope,
      permission: screenPermission("granted"),
      protectedApps: defaultProtectedAppRules()
    };

    const screen = await readAdapter(new ScreenObservationAdapter(options));
    const ocr = await readAdapter(
      new OcrObservationAdapter({
        ...options,
        engine: new MockOcrEngine()
      })
    );

    expect(screen.events).toHaveLength(0);
    expect(screen.result.warnings).toContain("Suppressed protected screen frame frame_secret.");
    expect(ocr.events).toHaveLength(0);
    expect(ocr.result.warnings).toContain(
      "Suppressed OCR for protected screen frame frame_secret."
    );
    expect(JSON.stringify([...screen.events, ...ocr.events])).not.toContain("hunter2");
    expect(JSON.stringify([...screen.events, ...ocr.events])).not.toContain("abc123");
  });

  it("stores bounded screen and OCR summaries without raw screenshots by default", async () => {
    const frames = [
      frame("frame_goal_8", {
        rawLocalRef: "sidecar://raw/frame_goal_8.png",
        sizeBytes: 120_000,
        ocrText: "Goal 8 screen OCR 支持中文 and English. password=hunter2"
      })
    ];
    const screen = await readAdapter(
      new ScreenObservationAdapter({
        frames,
        scope: displayScope,
        permission: screenPermission("granted")
      })
    );
    const ocr = await readAdapter(
      new OcrObservationAdapter({
        frames,
        scope: displayScope,
        engine: new MockOcrEngine(),
        permission: screenPermission("granted")
      })
    );

    expect(screen.events[0]?.type).toBe("screen_observation");
    expect(screen.events[0]?.source.kind).toBe("screen");
    expect(screen.events[0]?.content.rawRef).toBeUndefined();
    expect(screen.events[0]?.content.attachments).toBeUndefined();
    expect(screen.events[0]?.privacy.retentionPolicyId).toBe("perception_summary_only");
    expect(ocr.events[0]?.type).toBe("ocr_text");
    expect(ocr.events[0]?.source.kind).toBe("ocr");
    expect(ocr.events[0]?.context.threadId).toBe("screen-runtime");
    expect(ocr.events[0]?.content.summary).toContain("支持中文");
    expect(ocr.events[0]?.content.summary).toContain("[REDACTED]");
    expect(JSON.stringify(ocr.events[0])).not.toContain("hunter2");
  });

  it("can start, pause, resume, capture, and stop a scoped mock screen observation session", async () => {
    const helper = new MockScreenCaptureNativeHelper({
      frames: [frame("frame_smoke")],
      permission: screenPermission("granted")
    });
    const session = new ScreenObservationSession({
      helper,
      scope: displayScope,
      budget: {
        maxFrames: 1,
        minIntervalMs: 30_000
      }
    });

    expect((await session.start()).status).toBe("collecting");
    expect(await session.captureOnce()).toHaveLength(1);
    expect(session.pause().status).toBe("paused");
    expect(await session.captureOnce()).toHaveLength(0);
    expect(session.resume().status).toBe("collecting");
    expect(await session.captureOnce()).toHaveLength(1);
    expect(session.stop().status).toBe("stopped");
  });

  it("captures bounded multi-frame bursts with frame indexes and no raw storage by default", async () => {
    const frames = [
      frame("burst_frame_1", { sequence: 1 }),
      frame("burst_frame_2", {
        capturedAt: "2026-05-21T02:00:01.000Z",
        sequence: 2,
        frameHash: "burst_frame_hash_2"
      }),
      frame("burst_frame_3", {
        capturedAt: "2026-05-21T02:00:02.000Z",
        sequence: 3,
        frameHash: "burst_frame_hash_3"
      })
    ];
    const helper = new MockScreenCaptureNativeHelper({
      frames,
      permission: screenPermission("granted")
    });

    const burst = await captureScreenBurst({
      helper,
      scope: displayScope,
      runtimeSessionId: "screen-runtime",
      trigger: "manual",
      frameCount: 3,
      frameSpacingMs: 1000,
      protectedApps: defaultProtectedAppRules()
    });

    expect(burst.status).toBe("completed");
    expect(burst.frames).toHaveLength(3);
    expect(burst.frames.map((candidate) => candidate.frameIndex)).toEqual([0, 1, 2]);
    expect(burst.frames.every((candidate) => candidate.rawStored === false)).toBe(true);
    expect(burst.audit.map((entry) => entry.operation)).toEqual([
      "perception.burst_started",
      "perception.frame_captured",
      "perception.frame_captured",
      "perception.frame_captured",
      "perception.burst_completed"
    ]);
  });

  it("skips protected app scopes before invoking native capture", async () => {
    const protectedScope: ScreenCaptureScope = {
      kind: "app",
      label: "1Password",
      appBundleId: "com.1password.1password",
      appName: "1Password"
    };
    const helper = new MockScreenCaptureNativeHelper({
      frames: [frame("secret_frame", { scope: protectedScope })],
      permission: screenPermission("granted"),
      scopes: [protectedScope]
    });

    const burst = await captureScreenBurst({
      helper,
      scope: protectedScope,
      runtimeSessionId: "screen-runtime",
      trigger: "manual",
      frameCount: 3,
      frameSpacingMs: 1000,
      protectedApps: defaultProtectedAppRules()
    });

    expect(burst.status).toBe("skipped");
    expect(burst.skipReason).toBe("protected_app");
    expect(helper.captureCalls).toBe(0);
    expect(burst.frames).toHaveLength(0);
    expect(burst.audit.map((entry) => entry.operation)).toEqual([
      "perception.burst_skipped"
    ]);
  });
});

async function readAdapter(adapter: Parameters<typeof ingestEventsFromAdapter>[0]): Promise<{
  events: Event[];
  result: Awaited<ReturnType<typeof ingestEventsFromAdapter>>;
}> {
  const events: Event[] = [];
  const result = await ingestEventsFromAdapter(adapter, {
    upsertEvent(event) {
      events.push(event);
      return true;
    }
  });
  return { events, result };
}

const displayScope: ScreenCaptureScope = {
  kind: "display",
  label: "Fixture Display",
  displayId: "fixture-display"
};

function frame(id: string, overrides: Partial<ScreenCaptureFrame> = {}): ScreenCaptureFrame {
  return {
    id,
    capturedAt: "2026-05-21T02:00:00.000Z",
    runtimeSessionId: "screen-runtime",
    sequence: 1,
    scope: displayScope,
    app: {
      name: "Safari",
      bundleId: "com.apple.Safari"
    },
    window: {
      title: "Orbit Goal 8"
    },
    width: 1440,
    height: 900,
    frameHash: id,
    redactedSummary: "Goal 8 implementation notes are visible.",
    ocrText: "Goal 8 screen OCR notes",
    ...overrides
  };
}
