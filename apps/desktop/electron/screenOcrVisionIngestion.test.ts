import { describe, expect, it } from "vitest";
import type { Event } from "@orbit/core";
import type { VisionProvider, VisionSummaryInput } from "@orbit/ai";
import { ingestVisionSummariesForDesktop } from "./screenOcrVisionIngestion";

describe("desktop screen OCR vision ingestion", () => {
  it("routes retained screen frame evidence to the configured vision provider", async () => {
    const calls: VisionSummaryInput[] = [];
    const provider: VisionProvider = {
      id: "test_openai_vision",
      kind: "openai-compatible",
      enabled: true,
      name: "test",
      model: "gpt-vision",
      async summarizeVision(input) {
        calls.push(input);
        return {
          title: "Vision summary",
          summary: "The visible app is showing Orbit settings.",
          keyInsights: ["Settings are visible."],
          decisions: [],
          followUps: [],
          confidence: 0.8,
          provider: {
            id: "test_openai_vision",
            kind: "openai-compatible",
            model: "gpt-vision"
          },
          redactionState: input.policy.redactionState,
          exportEligible: input.policy.exportEligible,
          metadata: {
            promptVersion: "vision-work-context-v1",
            budget: input.budget,
            sourcePointer: input.source.sourcePointer,
            ...(input.screen.frameHash ? { frameHash: input.screen.frameHash } : {})
          }
        };
      }
    };
    const insertedEvents: Event[] = [];

    const result = await ingestVisionSummariesForDesktop({
      screenEvents: [screenEvent()],
      ocrEvents: [ocrEvent()],
      provider,
      policy: {
        providerEnabled: true,
        canUseScreenForAI: true,
        canUseVisionForAI: true,
        allowExternal: true,
        exportEligible: false,
        maxInputChars: 900,
        maxOutputTokens: 500,
        maxImagePixels: 320_000
      },
      language: "zh-CN",
      sourceRepository: memorySourceRepository(),
      eventRepository: {
        upsertEvent(event) {
          insertedEvents.push(event);
          return true;
        }
      }
    });

    expect(result.inserted).toBe(1);
    expect(insertedEvents[0]?.source.adapterId).toBe("perception_vision");
    expect(insertedEvents[0]?.content.rawRef).toBeUndefined();
    expect(calls[0]?.image?.localPath).toBe("/private/orbit/frame.png");
    expect(calls[0]?.policy.allowExternal).toBe(true);
    expect(calls[0]?.language).toBe("zh-CN");
  });

  it("keeps screen capture ingestion alive when the vision provider fails", async () => {
    const sourceRepository = memorySourceRepository();

    const result = await ingestVisionSummariesForDesktop({
      screenEvents: [screenEvent()],
      ocrEvents: [ocrEvent()],
      provider: {
        id: "failing_vision",
        kind: "openai-compatible",
        enabled: true,
        name: "failing",
        async summarizeVision() {
          throw new Error("provider offline");
        }
      },
      policy: {
        providerEnabled: true,
        canUseScreenForAI: true,
        canUseVisionForAI: true,
        allowExternal: true,
        exportEligible: false,
        maxInputChars: 900,
        maxOutputTokens: 500,
        maxImagePixels: 320_000
      },
      sourceRepository,
      eventRepository: {
        upsertEvent() {
          throw new Error("No vision event should be inserted.");
        }
      }
    });

    expect(result.inserted).toBe(0);
    expect(result.warnings[0]).toContain("provider offline");
    expect(sourceRepository.lastError).toContain("provider offline");
  });
});

function memorySourceRepository() {
  let cursor: string | undefined;
  const repository = {
    lastError: undefined as string | undefined,
    upsertFromAdapter() {
      return undefined;
    },
    getCursor() {
      return cursor;
    },
    setCursor(_sourceId: string, nextCursor: string | undefined) {
      cursor = nextCursor;
    },
    recordSyncSuccess() {
      repository.lastError = undefined;
    },
    recordSyncError(_sourceId: string, error: string) {
      repository.lastError = error;
    }
  };
  return repository;
}

function screenEvent(): Event {
  return {
    id: "event_screen",
    schemaVersion: 1,
    source: {
      kind: "screen",
      adapterId: "perception_screen",
      pointer: "screen://capture/runtime/display/frame_hash_1#1"
    },
    occurredAt: "2026-05-24T01:00:00.000Z",
    observedAt: "2026-05-24T01:00:00.000Z",
    context: {
      app: "Orbit",
      windowTitle: "Settings",
      threadId: "runtime"
    },
    type: "screen_observation",
    content: {
      title: "Screen observation in Orbit",
      summary: "Screen observation captured for display Main Display.",
      rawRef: "/private/orbit/frame.png",
      attachments: [
        {
          id: "frame_hash_1",
          kind: "image",
          name: "screen-frame",
          localRef: "/private/orbit/frame.png",
          sourcePointer: "screen://capture/runtime/display/frame_hash_1#1",
          sizeBytes: 1024,
          hash: "frame_hash_1"
        }
      ],
      metadata: {
        frameHash: "frame_hash_1",
        width: 640,
        height: 400,
        rawFrameStored: true,
        rawFrameLocalRef: "/private/orbit/frame.png",
        rawFrameSizeBytes: 1024
      }
    },
    privacy: {
      sensitivity: "confidential",
      retentionPolicyId: "perception_raw_frame_ttl_15m",
      redactionState: "none"
    },
    hash: "hash_screen"
  };
}

function ocrEvent(): Event {
  return {
    id: "event_ocr",
    schemaVersion: 1,
    source: {
      kind: "ocr",
      adapterId: "perception_ocr",
      pointer: "ocr://capture/runtime/frame_hash_1#1"
    },
    occurredAt: "2026-05-24T01:00:00.000Z",
    observedAt: "2026-05-24T01:00:00.000Z",
    context: {
      app: "Orbit",
      threadId: "runtime"
    },
    type: "ocr_text",
    content: {
      title: "OCR text in Orbit",
      summary: "Provider settings visible."
    },
    privacy: {
      sensitivity: "confidential",
      retentionPolicyId: "perception_summary_only",
      redactionState: "none"
    },
    hash: "hash_ocr"
  };
}
