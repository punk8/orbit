import { describe, expect, it } from "vitest";
import {
  createDefaultPerceptionStatus,
  defaultPerceptionProviderRoutes,
  createPerceptionPolicySnapshot,
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

  it("builds a disabled-by-default control-plane status with provider routes", () => {
    const status = createDefaultPerceptionStatus();

    expect(status.status).toBe("disabled");
    expect(status.enabled).toBe(false);
    expect(status.sources).toHaveLength(6);
    expect(status.sources.every((source) => source.status === "disabled")).toBe(true);
    expect(status.sources.every((source) => source.policy.canStoreRaw === false)).toBe(true);
    expect(status.sources.every((source) => source.policy.canUseForAI === false)).toBe(true);
    expect(status.sources.every((source) => source.policy.canExportToAgent === false)).toBe(true);
    expect(status.samplingPreset.name).toBe("conservative");
    expect(status.samplingPolicy.minimumBurstIntervalSeconds).toBe(120);
    expect(status.samplingPolicy.framesPerBurst).toBe(3);
    expect(status.samplingPolicy.frameSpacingMs).toBe(1000);
    expect(status.samplingPolicy.maxOcrFramesPerMinute).toBe(3);
    expect(status.samplingPolicy.rawFrameRetention).toBe("disabled");
    expect(status.resourcePolicy.cpu.minScreenCaptureIntervalMs).toBe(120_000);
    expect(status.resourcePolicy.cpu.maxOcrFramesPerMinute).toBe(3);
    expect(status.resourcePolicy.storage.defaultRawTtlMinutes).toBe(60);
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
    expect(snapshot.sourcePolicies.every((source) => source.canStoreRaw === false)).toBe(true);
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

  it("supports selectable sampling presets while keeping conservative fallback", () => {
    const balanced = createDefaultPerceptionStatus([], [], undefined, { preset: "balanced" });
    expect(balanced.samplingPreset.name).toBe("balanced");
    expect(balanced.samplingPolicy.minimumBurstIntervalSeconds).toBe(60);
    expect(balanced.samplingPolicy.framesPerBurst).toBe(4);
    expect(balanced.resourcePolicy.cpu.minScreenCaptureIntervalMs).toBe(60_000);
    expect(readPerceptionSamplingPreset("unknown").name).toBe("conservative");
  });
});
