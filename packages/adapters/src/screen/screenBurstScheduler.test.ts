import { describe, expect, it } from "vitest";
import { createDefaultPerceptionStatus, defaultProtectedAppRules } from "@orbit/core";
import { MockScreenCaptureNativeHelper } from "./mockScreenCaptureNativeHelper";
import { runScreenBurstScheduler } from "./screenBurstScheduler";
import type { ScreenCaptureFrame, ScreenCaptureScope } from "./screenCaptureTypes";
import { screenPermission } from "./screenCaptureTypes";

const displayScope: ScreenCaptureScope = {
  kind: "display",
  label: "Fixture Display",
  displayId: "fixture-display"
};

describe("screen burst scheduler", () => {
  it("runs an eligible low-frequency burst and records schedule/start/end audit", async () => {
    const helper = new MockScreenCaptureNativeHelper({
      frames: [
        frame("scheduler_frame_1"),
        frame("scheduler_frame_2", { sequence: 2 }),
        frame("scheduler_frame_3", { sequence: 3 })
      ],
      permission: screenPermission("granted")
    });
    const perception = createDefaultPerceptionStatus([
      {
        sourceKind: "screen",
        enabled: true,
        userIntent: "auto",
        permissionStatuses: { screen: "granted" }
      },
      {
        sourceKind: "ocr",
        enabled: true,
        userIntent: "auto",
        permissionStatuses: { screen: "granted" }
      }
    ]);

    const result = await runScreenBurstScheduler({
      helper,
      perception,
      scope: displayScope,
      runtimeSessionId: "scheduler-runtime",
      trigger: "timer",
      resourceState: { canCapture: true, state: "normal", reasons: [] },
      now: fixedNow
    });

    expect(result.status).toBe("completed");
    expect(result.burst?.frames).toHaveLength(3);
    expect(helper.captureCalls).toBe(1);
    expect(result.audit.map((entry) => entry.operation)).toEqual([
      "perception.burst_scheduled",
      "perception.burst_started",
      "perception.frame_captured",
      "perception.frame_captured",
      "perception.frame_captured",
      "perception.burst_completed"
    ]);
  });

  it("does not invoke the helper while paused, resource-limited, protected, or interval-limited", async () => {
    const helper = new MockScreenCaptureNativeHelper({
      frames: [frame("scheduler_frame_skip")],
      permission: screenPermission("granted")
    });
    const observing = createDefaultPerceptionStatus([
      {
        sourceKind: "screen",
        enabled: true,
        userIntent: "auto",
        permissionStatuses: { screen: "granted" }
      }
    ]);
    const paused = createDefaultPerceptionStatus([
      {
        sourceKind: "screen",
        enabled: true,
        paused: true,
        userIntent: "paused_user",
        permissionStatuses: { screen: "granted" }
      }
    ]);
    const protectedScope: ScreenCaptureScope = {
      kind: "app",
      label: "1Password",
      appName: "1Password",
      appBundleId: "com.1password.1password"
    };

    const pausedResult = await runScreenBurstScheduler({
      helper,
      perception: paused,
      scope: displayScope,
      runtimeSessionId: "scheduler-runtime",
      trigger: "timer",
      resourceState: { canCapture: true, state: "normal", reasons: [] },
      now: fixedNow
    });
    const resourceResult = await runScreenBurstScheduler({
      helper,
      perception: observing,
      scope: displayScope,
      runtimeSessionId: "scheduler-runtime",
      trigger: "timer",
      resourceState: {
        canCapture: false,
        state: "paused_resource_budget",
        reasons: ["queue_depth_cap"]
      },
      now: fixedNow
    });
    const protectedResult = await runScreenBurstScheduler({
      helper,
      perception: observing,
      scope: protectedScope,
      runtimeSessionId: "scheduler-runtime",
      trigger: "timer",
      protectedApps: defaultProtectedAppRules(),
      resourceState: { canCapture: true, state: "normal", reasons: [] },
      now: fixedNow
    });
    const intervalResult = await runScreenBurstScheduler({
      helper,
      perception: observing,
      scope: displayScope,
      runtimeSessionId: "scheduler-runtime",
      trigger: "timer",
      lastBurstAt: "2026-05-23T06:29:30.000Z",
      resourceState: { canCapture: true, state: "normal", reasons: [] },
      now: fixedNow
    });

    expect(pausedResult).toMatchObject({ status: "skipped", skipReason: "runtime_paused" });
    expect(resourceResult).toMatchObject({ status: "skipped", skipReason: "resource_limited" });
    expect(protectedResult).toMatchObject({ status: "skipped", skipReason: "protected_app" });
    expect(intervalResult).toMatchObject({ status: "skipped", skipReason: "interval_not_due" });
    expect(helper.captureCalls).toBe(0);
    expect(resourceResult.audit).toEqual([
      expect.objectContaining({
        operation: "perception.burst_skipped",
        reason: "resource_limited"
      })
    ]);
  });

  it("audits protected skips with rule id and reason without private window text", async () => {
    const helper = new MockScreenCaptureNativeHelper({
      frames: [frame("scheduler_frame_secret")],
      permission: screenPermission("granted")
    });
    const observing = createDefaultPerceptionStatus([
      {
        sourceKind: "screen",
        enabled: true,
        userIntent: "auto",
        permissionStatuses: { screen: "granted" }
      }
    ]);
    const protectedScope: ScreenCaptureScope = {
      kind: "app",
      label: "Private Banking OTP",
      appName: "Safari",
      appBundleId: "com.apple.Safari"
    };

    const result = await runScreenBurstScheduler({
      helper,
      perception: observing,
      scope: protectedScope,
      runtimeSessionId: "scheduler-runtime",
      trigger: "timer",
      protectedApps: defaultProtectedAppRules(),
      resourceState: { canCapture: true, state: "normal", reasons: [] },
      now: fixedNow
    });

    expect(result.status).toBe("skipped");
    expect(result.audit).toEqual([
      expect.objectContaining({
        operation: "perception.burst_skipped",
        reason: "protected_app",
        protectedRuleId: expect.any(String),
        protectedReason: expect.any(String),
        protectedContentDropped: 0
      })
    ]);
    expect(JSON.stringify(result.audit)).not.toContain("Private Banking OTP");
    expect(helper.captureCalls).toBe(0);
  });

  it("uses protected window metadata before invoking the helper", async () => {
    const helper = new MockScreenCaptureNativeHelper({
      frames: [frame("scheduler_window_secret")],
      permission: screenPermission("granted")
    });
    const observing = createDefaultPerceptionStatus([
      {
        sourceKind: "screen",
        enabled: true,
        userIntent: "auto",
        permissionStatuses: { screen: "granted" }
      }
    ]);

    const result = await runScreenBurstScheduler({
      helper,
      perception: observing,
      scope: { kind: "window", label: "Incognito login code", windowId: "42" },
      runtimeSessionId: "scheduler-runtime-window",
      trigger: "timer",
      protectedApps: defaultProtectedAppRules(),
      resourceState: { canCapture: true, state: "normal", reasons: [] },
      now: fixedNow
    });

    expect(result.status).toBe("skipped");
    expect(result.skipReason).toBe("protected_app");
    expect(result.audit[0]).toMatchObject({
      operation: "perception.burst_skipped",
      protectedContentDropped: 0
    });
    expect(JSON.stringify(result.audit)).not.toContain("login code");
    expect(helper.captureCalls).toBe(0);
  });

  it("re-checks runtime and resource state after scheduling before invoking the helper", async () => {
    const helper = new MockScreenCaptureNativeHelper({
      frames: [frame("scheduler_frame_cancelled")],
      permission: screenPermission("granted")
    });
    const observing = createDefaultPerceptionStatus([
      {
        sourceKind: "screen",
        enabled: true,
        userIntent: "auto",
        permissionStatuses: { screen: "granted" }
      }
    ]);
    const paused = createDefaultPerceptionStatus([
      {
        sourceKind: "screen",
        enabled: true,
        paused: true,
        userIntent: "paused_user",
        permissionStatuses: { screen: "granted" }
      }
    ]);

    const runtimeCancelled = await runScreenBurstScheduler({
      helper,
      perception: observing,
      readPerception: () => paused,
      scope: displayScope,
      runtimeSessionId: "scheduler-runtime",
      trigger: "timer",
      resourceState: { canCapture: true, state: "normal", reasons: [] },
      now: fixedNow
    });
    const resourceCancelled = await runScreenBurstScheduler({
      helper,
      perception: observing,
      readResourceState: () => ({
        canCapture: false,
        state: "paused_resource_budget",
        reasons: ["queue_depth_cap"]
      }),
      scope: displayScope,
      runtimeSessionId: "scheduler-runtime",
      trigger: "timer",
      resourceState: { canCapture: true, state: "normal", reasons: [] },
      now: fixedNow
    });

    expect(runtimeCancelled).toMatchObject({ status: "skipped", skipReason: "runtime_paused" });
    expect(runtimeCancelled.audit.map((entry) => entry.operation)).toEqual([
      "perception.burst_scheduled",
      "perception.burst_skipped"
    ]);
    expect(resourceCancelled).toMatchObject({ status: "skipped", skipReason: "resource_limited" });
    expect(helper.captureCalls).toBe(0);
  });
});

function fixedNow(): Date {
  return new Date("2026-05-23T06:30:00.000Z");
}

function frame(id: string, patch: Partial<ScreenCaptureFrame> = {}): ScreenCaptureFrame {
  return {
    id,
    capturedAt: "2026-05-23T06:30:00.000Z",
    runtimeSessionId: "scheduler-runtime",
    sequence: 1,
    scope: displayScope,
    frameHash: `${id}_hash`,
    redactedSummary: "Scheduler test frame.",
    ...patch
  };
}
