import { describe, expect, it } from "vitest";
import { mockTranscriptionProvider } from "./transcription";

describe("transcription providers", () => {
  it("produces deterministic mock transcripts and enforces policy", async () => {
    const input = {
      segmentId: "segment_1",
      segmentHash: "segment_hash_1",
      startedAt: "2026-05-21T00:10:00.000Z",
      durationMs: 12_000,
      fixtureTranscript: "Discussed bounded audio transcription.",
      policy: {
        canUseForAI: true,
        allowExternal: false,
        redactionState: "none" as const
      }
    };

    const output = await mockTranscriptionProvider.transcribe(input);
    expect(output.provider.kind).toBe("mock");
    expect(output.text).toContain("bounded audio");

    await expect(
      mockTranscriptionProvider.transcribe({
        ...input,
        policy: {
          ...input.policy,
          canUseForAI: false
        }
      })
    ).rejects.toThrow(/does not allow AI/);
  });
});
