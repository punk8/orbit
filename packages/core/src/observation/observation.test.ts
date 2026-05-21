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

  it("rejects invalid observation runtime transitions", () => {
    expect(() => assertObservationStatusTransition("ready", "paused")).toThrow(
      /Invalid observation status transition/
    );
    expect(() => assertObservationStatusTransition("ready", "collecting")).not.toThrow();
  });
});
