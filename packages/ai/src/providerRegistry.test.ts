import { describe, expect, it } from "vitest";
import { createDefaultPerceptionStatus } from "@orbit/core";
import { buildAIProviderRuntimeRegistry } from "./providerRegistry";

describe("AI provider runtime registry", () => {
  it("registers every task as disabled by default", () => {
    const registry = buildAIProviderRuntimeRegistry({
      generatedAt: "2026-05-21T00:00:00.000Z"
    });

    expect(registry.tasks.map((task) => task.task)).toEqual([
      "activity_overview_summary",
      "knowledge_draft",
      "vision_summary",
      "ocr_postprocess",
      "transcription",
      "memory_candidate",
      "recommendation",
      "embedding",
      "redaction",
      "context_compression"
    ]);
    expect(registry.summary.disabled).toBe(10);
    expect(registry.tasks.every((task) => task.enabled === false)).toBe(true);
  });

  it("reports missing OpenAI-compatible configuration without leaking credentials", () => {
    const registry = buildAIProviderRuntimeRegistry({
      aiProviderConfig: {
        kind: "openai-compatible",
        apiKey: "secret-api-key"
      },
      generatedAt: "2026-05-21T00:00:00.000Z"
    });

    const knowledge = registry.tasks.find((task) => task.task === "knowledge_draft");
    expect(knowledge?.state).toBe("missing_configuration");
    expect(knowledge?.configuration).toEqual({
      hasBaseUrl: false,
      hasModel: false,
      hasApiKey: true
    });
    expect(JSON.stringify(registry)).not.toContain("secret-api-key");
  });

  it("resolves mock vision only when screen and vision policy allow AI use", () => {
    const blocked = buildAIProviderRuntimeRegistry({
      perceptionStatus: createDefaultPerceptionStatus(
        [],
        [
          {
            task: "vision",
            provider: "mock",
            enabled: true,
            allowExternal: false
          }
        ]
      ),
      generatedAt: "2026-05-21T00:00:00.000Z"
    });
    expect(blocked.tasks.find((task) => task.task === "vision_summary")?.state).toBe(
      "skipped_by_policy"
    );

    const allowed = buildAIProviderRuntimeRegistry({
      perceptionStatus: createDefaultPerceptionStatus(
        [
          { sourceKind: "screen", policy: { canUseForAI: true } },
          { sourceKind: "vision", policy: { canUseForAI: true } }
        ],
        [
          {
            task: "vision",
            provider: "mock",
            enabled: true,
            allowExternal: false
          }
        ]
      ),
      generatedAt: "2026-05-21T00:00:00.000Z"
    });

    const vision = allowed.tasks.find((task) => task.task === "vision_summary");
    expect(vision?.state).toBe("ready");
    expect(vision?.providerKind).toBe("mock");
    expect(vision?.sourceKinds).toEqual(["screen", "vision"]);
  });

  it("distinguishes registered future tasks from implemented runners", () => {
    const registry = buildAIProviderRuntimeRegistry({
      aiProviderConfig: {
        kind: "mock"
      },
      generatedAt: "2026-05-21T00:00:00.000Z"
    });

    expect(registry.tasks.find((task) => task.task === "knowledge_draft")?.state).toBe("ready");
    expect(registry.tasks.find((task) => task.task === "memory_candidate")?.state).toBe(
      "not_implemented"
    );
    expect(registry.tasks.find((task) => task.task === "recommendation")?.state).toBe(
      "not_implemented"
    );
  });
});
