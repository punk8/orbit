import { describe, expect, it } from "vitest";
import { perceptionCapabilityDescriptors } from "../index";

describe("perception capability descriptors", () => {
  it("exposes screen and audio as disabled research-only future inputs", () => {
    expect(perceptionCapabilityDescriptors.map((descriptor) => descriptor.sourceKind)).toEqual([
      "screen",
      "audio"
    ]);

    for (const descriptor of perceptionCapabilityDescriptors) {
      expect(descriptor.status).toBe("research_only");
      expect(descriptor.enabledByDefault).toBe(false);
      expect(descriptor.requiresExplicitPermission).toBe(true);
      expect(descriptor.capturesRawMedia).toBe(false);
      expect(descriptor.defaultAgentExport).toBe(false);
    }
  });
});
