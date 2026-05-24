import { describe, expect, it } from "vitest";
import {
  createDefaultPerceptionStatus,
  defaultPerceptionProviderRoutes,
  defaultPerceptionResourcePolicy,
  evaluatePerceptionResourceState,
  createPerceptionPolicySnapshot,
  getSourceInstallRuntimeHardeningCases,
  mapSourceInstallRuntimeFailure,
  readPerceptionSamplingPreset,
  perceptionCapabilityDescriptors
} from "../index";

describe("perception capability descriptors", () => {
  it("exposes Goal 8 perception sources as disabled control-plane inputs", () => {
    expect(perceptionCapabilityDescriptors.map((descriptor) => descriptor.sourceKind)).toEqual([
      "screen",
      "ocr",
      "vision",
      "microphone_audio",
      "system_audio",
      "transcript"
    ]);

    for (const descriptor of perceptionCapabilityDescriptors) {
      expect(descriptor.status).toBe("control_plane");
      expect(descriptor.enabledByDefault).toBe(false);
      expect(descriptor.requiresExplicitPermission).toBe(true);
      expect(descriptor.capturesRawMedia).toBe(false);
      expect(descriptor.defaultAgentExport).toBe(false);
    }
  });

  it("builds a Yansu-like local frame retention control-plane status with provider routes", () => {
    const status = createDefaultPerceptionStatus();
    const screen = status.sources.find((source) => source.sourceKind === "screen");
    const ocr = status.sources.find((source) => source.sourceKind === "ocr");

    expect(status.status).toBe("disabled");
    expect(status.enabled).toBe(false);
    expect(status.sources).toHaveLength(6);
    expect(status.sources.every((source) => source.status === "disabled")).toBe(true);
    expect(screen?.policy).toMatchObject({
      canStoreRaw: true,
      rawRetentionTtlMinutes: 72 * 60,
      retentionPolicyId: "perception_raw_ttl_72h"
    });
    expect(ocr?.policy).toMatchObject({
      canStoreRaw: false,
      rawRetentionTtlMinutes: null,
      retentionPolicyId: "perception_summary_only"
    });
    expect(
      status.sources
        .filter((source) => source.sourceKind !== "screen")
        .every((source) => source.policy.canStoreRaw === false)
    ).toBe(true);
    expect(status.sources.every((source) => source.policy.canUseForAI === false)).toBe(true);
    expect(status.sources.every((source) => source.policy.canExportToAgent === false)).toBe(true);
    expect(status.samplingPreset.name).toBe("conservative");
    expect(status.samplingPolicy.minimumBurstIntervalSeconds).toBe(120);
    expect(status.samplingPolicy.framesPerBurst).toBe(3);
    expect(status.samplingPolicy.frameSpacingMs).toBe(1000);
    expect(status.samplingPolicy.maxOcrFramesPerMinute).toBe(3);
    expect(status.samplingPolicy.rawFrameRetention).toBe("short_ttl");
    expect(status.samplingPolicy.rawFrameTtlIfEnabledMinutes).toBe(72 * 60);
    expect(status.resourcePolicy.cpu.minScreenCaptureIntervalMs).toBe(120_000);
    expect(status.resourcePolicy.cpu.maxOcrFramesPerMinute).toBe(3);
    expect(status.resourcePolicy.storage.defaultRawTtlMinutes).toBe(72 * 60);
    expect(status.resourcePolicy.storage.maxRawSidecarBytes).toBe(2 * 1024 * 1024 * 1024);
    expect(status.resourcePolicy.provider.allowExternalByDefault).toBe(false);
    expect(defaultPerceptionProviderRoutes.map((route) => route.task)).toEqual([
      "ocr",
      "vision",
      "transcription"
    ]);
  });

  it("creates stable source policy snapshots for audit and status output", () => {
    const status = createDefaultPerceptionStatus();
    const snapshot = createPerceptionPolicySnapshot(status);

    expect(snapshot.id).toMatch(/^perception_policy_/);
    expect(snapshot.samplingPolicy.preset).toBe("conservative");
    expect(snapshot.sourcePolicies.map((source) => source.sourceKind)).toEqual([
      "screen",
      "ocr",
      "vision",
      "microphone_audio",
      "system_audio",
      "transcript"
    ]);
    expect(snapshot.sourcePolicies.find((source) => source.sourceKind === "screen")).toMatchObject({
      canStoreRaw: true,
      rawRetentionTtlMinutes: 72 * 60,
      retentionPolicyId: "perception_raw_ttl_72h"
    });
    expect(
      snapshot.sourcePolicies
        .filter((source) => source.sourceKind !== "screen")
        .every((source) => source.canStoreRaw === false)
    ).toBe(true);
    expect(snapshot.providerRoutes.every((route) => route.provider === "disabled")).toBe(true);
    expect(snapshot.protectedAppRuleCount).toBeGreaterThan(0);
    expect(createPerceptionPolicySnapshot(status).id).toBe(snapshot.id);
  });

  it("marks enabled sources as needing permission before capture can run", () => {
    const status = createDefaultPerceptionStatus([
      {
        sourceKind: "screen",
        enabled: true,
        paused: false
      }
    ]);

    expect(status.status).toBe("needs_permission");
    expect(status.sources.find((source) => source.sourceKind === "screen")?.status).toBe(
      "needs_permission"
    );
  });

  it("models the Alpha dogfood runtime state separately from source policy", () => {
    const firstLaunch = createDefaultPerceptionStatus();
    expect(firstLaunch.dogfoodRuntime).toMatchObject({
      state: "needs_permission",
      permission: "not_determined",
      reason: "screen_recording_permission_missing",
      nextAction: "grant_screen_recording_permission",
      autoStartEnabled: true
    });

    const permissionOnly = createDefaultPerceptionStatus([
      {
        sourceKind: "screen",
        enabled: false,
        paused: false,
        permissionStatuses: { screen: "granted" }
      },
      {
        sourceKind: "ocr",
        enabled: false,
        paused: false,
        permissionStatuses: { screen: "granted" }
      }
    ]);
    expect(permissionOnly.dogfoodRuntime).toMatchObject({
      state: "stopped",
      permission: "granted",
      reason: "user_stopped",
      nextAction: "resume_or_enable_observation",
      autoStartEnabled: false
    });

    const granted = createDefaultPerceptionStatus([
      {
        sourceKind: "screen",
        enabled: true,
        paused: false,
        userIntent: "auto",
        permissionStatuses: { screen: "granted" }
      },
      {
        sourceKind: "ocr",
        enabled: true,
        paused: false,
        userIntent: "auto",
        permissionStatuses: { screen: "granted" }
      }
    ]);
    expect(granted.dogfoodRuntime).toMatchObject({
      state: "observing",
      permission: "granted",
      reason: "screen_recording_permission_granted",
      nextAction: "wait_for_next_burst",
      autoStartEnabled: true
    });

    const paused = createDefaultPerceptionStatus([
      {
        sourceKind: "screen",
        enabled: true,
        paused: true,
        userIntent: "paused_user",
        permissionStatuses: { screen: "granted" }
      }
    ]);
    expect(paused.dogfoodRuntime).toMatchObject({
      state: "paused_user",
      reason: "user_paused",
      nextAction: "resume_observation",
      autoStartEnabled: false
    });

    const stopped = createDefaultPerceptionStatus([
      {
        sourceKind: "screen",
        enabled: false,
        paused: false,
        userIntent: "stopped",
        permissionStatuses: { screen: "granted" }
      }
    ]);
    expect(stopped.dogfoodRuntime).toMatchObject({
      state: "stopped",
      reason: "user_stopped",
      nextAction: "resume_or_enable_observation",
      autoStartEnabled: false
    });
  });

  it("supports selectable sampling presets while keeping conservative fallback", () => {
    const balanced = createDefaultPerceptionStatus([], [], undefined, { preset: "balanced" });
    expect(balanced.samplingPreset.name).toBe("balanced");
    expect(balanced.samplingPolicy.minimumBurstIntervalSeconds).toBe(60);
    expect(balanced.samplingPolicy.framesPerBurst).toBe(4);
    expect(balanced.resourcePolicy.cpu.minScreenCaptureIntervalMs).toBe(60_000);
    expect(readPerceptionSamplingPreset("unknown").name).toBe("conservative");
  });

  it("pauses capture on low battery or exhausted resource budgets", () => {
    const policy = defaultPerceptionResourcePolicy();

    expect(
      evaluatePerceptionResourceState(policy, {
        lowPowerMode: true,
        batteryPercent: 80,
        rawSidecarBytes: 0,
        queueDepth: 0,
        providerRequestsLastHour: 0,
        providerInputCharsPending: 0,
        providerTokensLastHour: 0
      })
    ).toMatchObject({
      canCapture: false,
      state: "paused_low_power",
      reasons: ["low_power_mode"]
    });

    expect(
      evaluatePerceptionResourceState(policy, {
        lowPowerMode: false,
        batteryPercent: 10,
        rawSidecarBytes: policy.storage.maxRawSidecarBytes + 1,
        queueDepth: policy.queue.maxItems + 1,
        providerRequestsLastHour: policy.provider.maxRequestsPerHour + 1,
        providerInputCharsPending: policy.provider.maxInputCharsPerRequest + 1,
        providerTokensLastHour: policy.provider.maxTokensPerHour + 1
      })
    ).toMatchObject({
      canCapture: false,
      state: "paused_resource_budget",
      reasons: expect.arrayContaining([
        "battery_below_threshold",
        "raw_sidecar_storage_cap",
        "queue_depth_cap",
        "provider_request_cap",
        "provider_input_size_cap",
        "provider_token_cap"
      ])
    });
  });

  it("maps source-install runtime failures to visible status reasons and next actions", () => {
    expect(getSourceInstallRuntimeHardeningCases().map((item) => item.kind)).toEqual([
      "helper_missing",
      "helper_timeout",
      "permission_missing",
      "permission_revoked",
      "protected_context",
      "resource_paused",
      "sqlite_lock",
      "native_abi_mismatch",
      "storage_cap_reached"
    ]);

    expect(mapSourceInstallRuntimeFailure("helper_missing")).toMatchObject({
      state: "error",
      reason: "helper_missing",
      nextAction: "repair_native_helper"
    });
    expect(mapSourceInstallRuntimeFailure("helper_timeout")).toMatchObject({
      state: "error",
      reason: "helper_timeout",
      nextAction: "retry_or_rebuild_native_helper"
    });
    expect(mapSourceInstallRuntimeFailure("permission_missing")).toMatchObject({
      state: "needs_permission",
      reason: "screen_recording_permission_missing",
      nextAction: "grant_screen_recording_permission"
    });
    expect(mapSourceInstallRuntimeFailure("permission_revoked")).toMatchObject({
      state: "needs_permission",
      reason: "screen_recording_permission_revoked",
      nextAction: "grant_screen_recording_permission"
    });
    expect(mapSourceInstallRuntimeFailure("protected_context")).toMatchObject({
      state: "protected",
      reason: "protected_context",
      nextAction: "switch_context_or_update_protection"
    });
    expect(mapSourceInstallRuntimeFailure("resource_paused")).toMatchObject({
      state: "paused_resource",
      reason: "resource_policy_pause",
      nextAction: "reduce_resource_pressure"
    });
    expect(mapSourceInstallRuntimeFailure("sqlite_lock")).toMatchObject({
      state: "error",
      reason: "sqlite_lock_or_migration_failed",
      nextAction: "repair_local_database"
    });
    expect(mapSourceInstallRuntimeFailure("native_abi_mismatch")).toMatchObject({
      state: "error",
      reason: "native_abi_mismatch",
      nextAction: "rebuild_native_modules"
    });
    expect(mapSourceInstallRuntimeFailure("storage_cap_reached")).toMatchObject({
      state: "paused_resource",
      reason: "storage_cap_reached",
      nextAction: "run_cleanup_or_increase_storage_budget"
    });
  });
});
