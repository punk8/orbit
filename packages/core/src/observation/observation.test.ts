import { describe, expect, it } from "vitest";
import {
  assertObservationStatusTransition,
  normalizeObservationInput,
  observationSourcePointer
} from "../index";
import type { ObservationInput } from "../index";

describe("observation normalization", () => {
  it("creates stable desktop app focus Events", () => {
    const input: ObservationInput = {
      type: "app_focus",
      tier: "tier1",
      sourceKind: "desktop",
      occurredAt: "2026-05-21T01:00:00.000Z",
      runtimeSessionId: "obs-test",
      sequence: 1,
      app: {
        name: "Terminal",
        bundleId: "com.apple.Terminal",
        pid: 101
      }
    };

    const first = normalizeObservationInput(input);
    const second = normalizeObservationInput(input);

    expect(first.id).toBe(second.id);
    expect(first.source.pointer).toBe("desktop://app-focus/obs-test#1");
    expect(first.source.kind).toBe("desktop");
    expect(first.type).toBe("app_focus");
    expect(first.content.summary).toContain("Terminal");
    expect(first.content.text).toBeUndefined();
    expect(first.privacy.sensitivity).toBe("internal");
  });

  it("suppresses semantic window text for protected apps", () => {
    const event = normalizeObservationInput({
      type: "window_focus",
      tier: "tier1",
      sourceKind: "desktop",
      occurredAt: "2026-05-21T01:05:02.000Z",
      runtimeSessionId: "obs-protected",
      sequence: 2,
      app: {
        name: "1Password",
        bundleId: "com.1password.1password",
        isProtected: true
      },
      window: {
        title: "Private vault - API token",
        titleHash: "private"
      },
      raw: {
        text: "Private vault - API token"
      }
    });

    expect(event.type).toBe("app_focus");
    expect(event.source.pointer).toBe("desktop://app-focus/obs-protected#2");
    expect(event.context.windowTitle).toBeUndefined();
    expect(JSON.stringify(event)).not.toContain("Private vault");
    expect(JSON.stringify(event)).not.toContain("API token");
    expect(event.privacy.redactionState).toBe("redacted");
  });

  it("generates canonical pointers for observation inputs", () => {
    expect(
      observationSourcePointer({
        type: "clipboard_change",
        tier: "tier2",
        sourceKind: "clipboard",
        occurredAt: "2026-05-21T01:00:00.000Z",
        runtimeSessionId: "obs-test",
        sequence: 3,
        clipboard: {
          contentType: "text",
          contentHash: "hash"
        }
      })
    ).toBe("clipboard://change/obs-test#3");
  });

  it("normalizes bounded screen and OCR perception Events", () => {
    const screen = normalizeObservationInput({
      type: "screen_observation",
      tier: "tier3",
      sourceKind: "screen",
      occurredAt: "2026-05-21T01:10:00.000Z",
      runtimeSessionId: "screen-runtime",
      sequence: 1,
      app: {
        name: "Safari",
        bundleId: "com.apple.Safari"
      },
      window: {
        title: "Orbit Goal 8"
      },
      screen: {
        scopeKind: "window",
        scopeLabel: "Orbit Goal 8",
        frameHash: "frame_hash_1",
        width: 1280,
        height: 720,
        redactedSummary: "Goal 8 implementation notes are visible."
      }
    });
    const ocr = normalizeObservationInput({
      type: "ocr_text",
      tier: "tier3",
      sourceKind: "ocr",
      occurredAt: "2026-05-21T01:10:01.000Z",
      runtimeSessionId: "screen-runtime",
      sequence: 2,
      app: {
        name: "Safari",
        bundleId: "com.apple.Safari"
      },
      ocr: {
        text: "Goal 8 screen OCR 支持中文 and English.",
        textHash: "ocr_hash_1",
        sourceFrameHash: "frame_hash_1",
        languages: ["en", "zh-Hans"],
        engine: "mock-local"
      }
    });

    expect(screen.source.pointer).toBe("screen://capture/screen-runtime/window/frame_hash_1#1");
    expect(screen.source.kind).toBe("screen");
    expect(screen.context.threadId).toBe("screen-runtime");
    expect(screen.content.summary).toContain("1280x720");
    expect(screen.classification?.topics).toEqual(["perception", "screen_ocr"]);
    expect(ocr.source.pointer).toBe("ocr://capture/screen-runtime/frame_hash_1#2");
    expect(ocr.source.kind).toBe("ocr");
    expect(ocr.context.threadId).toBe("screen-runtime");
    expect(ocr.content.summary).toContain("支持中文");
  });

  it("rejects invalid observation runtime transitions", () => {
    expect(() => assertObservationStatusTransition("ready", "paused")).toThrow(
      /Invalid observation status transition/
    );
    expect(() => assertObservationStatusTransition("ready", "collecting")).not.toThrow();
  });
});
