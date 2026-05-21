import { describe, expect, it } from "vitest";
import {
  createDefaultPerceptionStatus,
  defaultPerceptionProviderRoutes,
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
    expect(defaultPerceptionProviderRoutes.map((route) => route.task)).toEqual([
      "ocr",
      "vision",
      "transcription"
    ]);
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
});
