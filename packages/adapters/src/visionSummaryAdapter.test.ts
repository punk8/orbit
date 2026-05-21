import { describe, expect, it } from "vitest";
import type { Event } from "@orbit/core";
import { hashObject, ingestEventsFromAdapter } from "@orbit/core";
import type { VisionProvider } from "@orbit/ai";
import { mockVisionProvider } from "@orbit/ai";
import { VisionSummaryAdapter } from "./vision/visionSummaryAdapter";

describe("vision summary adapter", () => {
  it("turns mock vision summaries into bounded screen observation Events", async () => {
    const result = await readAdapter(
      new VisionSummaryAdapter({
        screenEvents: [screenEvent()],
        ocrEvents: [ocrEvent()],
        provider: mockVisionProvider,
        policy: allowVisionPolicy()
      })
    );

    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.type).toBe("screen_observation");
    expect(result.events[0]?.source.adapterId).toBe("perception_vision");
    expect(result.events[0]?.content.summary).toContain("Settings scroll split is visible");
    expect(result.events[0]?.content.metadata).toMatchObject({
      vision: {
        provider: {
          kind: "mock"
        },
        promptVersion: "vision-work-context-v1",
        sourceEventId: "event_screen"
      }
    });
    expect(result.events[0]?.content.rawRef).toBeUndefined();
  });

  it("blocks provider calls when source policy or redaction state is unsafe", async () => {
    let calls = 0;
    const provider: VisionProvider = {
      ...mockVisionProvider,
      async summarizeVision(input) {
        calls += 1;
        return mockVisionProvider.summarizeVision(input);
      }
    };
    const blocked = await readAdapter(
      new VisionSummaryAdapter({
        screenEvents: [screenEvent()],
        provider,
        policy: {
          ...allowVisionPolicy(),
          canUseVisionForAI: false
        }
      })
    );
    const failed = await readAdapter(
      new VisionSummaryAdapter({
        screenEvents: [
          screenEvent({
            privacy: {
              sensitivity: "confidential",
              retentionPolicyId: "perception_summary_only",
              redactionState: "failed"
            }
          })
        ],
        provider,
        policy: allowVisionPolicy()
      })
    );

    expect(blocked.events).toHaveLength(0);
    expect(blocked.result.warnings[0]).toContain("blocked by screen or vision source policy");
    expect(failed.events).toHaveLength(0);
    expect(failed.result.warnings[0]).toContain("failed-redaction");
    expect(calls).toBe(0);
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

function allowVisionPolicy(): ConstructorParameters<typeof VisionSummaryAdapter>[0]["policy"] {
  return {
    providerEnabled: true,
    canUseScreenForAI: true,
    canUseVisionForAI: true,
    allowExternal: false,
    exportEligible: false,
    maxInputChars: 500,
    maxOutputTokens: 300,
    maxImagePixels: 320_000
  };
}

function screenEvent(overrides: Partial<Event> = {}): Event {
  const input: Event = {
    id: "event_screen",
    schemaVersion: 1,
    source: {
      kind: "screen",
      adapterId: "perception_screen",
      pointer: "screen://capture/runtime/display/frame_hash_1#1"
    },
    occurredAt: "2026-05-21T00:00:00.000Z",
    observedAt: "2026-05-21T00:00:00.000Z",
    context: {
      app: "Cursor",
      windowTitle: "Orbit Settings",
      threadId: "runtime"
    },
    type: "screen_observation",
    content: {
      title: "Screen observation in Cursor",
      summary: "Settings scroll split is visible in Orbit."
    },
    classification: {
      topics: ["perception", "screen_ocr"],
      entities: ["Cursor"],
      intent: "observation",
      confidence: 0.8
    },
    privacy: {
      sensitivity: "confidential",
      retentionPolicyId: "perception_summary_only",
      redactionState: "none"
    },
    hash: "hash_screen"
  };
  return { ...input, ...overrides, hash: hashObject({ ...input, ...overrides }) };
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
    occurredAt: "2026-05-21T00:00:00.000Z",
    observedAt: "2026-05-21T00:00:00.000Z",
    context: {
      app: "Cursor",
      threadId: "runtime"
    },
    type: "ocr_text",
    content: {
      title: "OCR text in Cursor",
      summary: "AI provider and privacy panes should scroll independently."
    },
    privacy: {
      sensitivity: "confidential",
      retentionPolicyId: "perception_summary_only",
      redactionState: "none"
    },
    hash: "hash_ocr"
  };
}
