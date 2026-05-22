import { describe, expect, it } from "vitest";
import type { Event, ProtectedAppRule } from "@orbit/core";
import { DESKTOP_OBSERVATION_ADAPTER_ID } from "@orbit/core";
import { InProcessObservationQueue } from "@orbit/adapters";
import { tier1MacHelperEventToObservationInputs } from "./tier1MacObserver";

describe("Tier1MacObserver normalization", () => {
  it("maps frontmost app helper events to app and window observations", () => {
    let sequence = 0;
    const inputs = tier1MacHelperEventToObservationInputs(
      {
        type: "frontmost_app_changed",
        occurredAt: "2026-05-21T02:00:00.000Z",
        appName: "Terminal",
        bundleId: "com.apple.Terminal",
        pid: 123,
        windowTitle: "orbit - zsh"
      },
      "obs-runtime",
      () => {
        sequence += 1;
        return sequence;
      }
    );

    expect(inputs).toHaveLength(2);
    expect(inputs[0]?.type).toBe("app_focus");
    expect(inputs[1]?.type).toBe("window_focus");
    expect(inputs[1]?.window?.title).toBe("orbit - zsh");
    expect(inputs.map((input) => input.sequence)).toEqual([1, 2]);
  });

  it("keeps app focus when window title is unavailable", () => {
    const inputs = tier1MacHelperEventToObservationInputs(
      {
        type: "frontmost_app_changed",
        occurredAt: "2026-05-21T02:00:00.000Z",
        appName: "Finder",
        bundleId: "com.apple.finder"
      },
      "obs-runtime",
      () => 1
    );

    expect(inputs).toHaveLength(1);
    expect(inputs[0]?.type).toBe("app_focus");
    expect(inputs[0]?.window).toBeUndefined();
  });

  it("suppresses protected helper window titles before desktop events are persisted", async () => {
    let sequence = 0;
    const protectedApps: ProtectedAppRule[] = [
      {
        id: "protected_1password_test",
        match: { kind: "bundle_id", value: "com.1password.1password" },
        reason: "default_sensitive_app",
        enabled: true
      }
    ];
    const inputs = tier1MacHelperEventToObservationInputs(
      {
        type: "frontmost_app_changed",
        occurredAt: "2026-05-21T02:00:00.000Z",
        appName: "1Password",
        bundleId: "com.1password.1password",
        pid: 321,
        windowTitle: "Private vault - API token"
      },
      "obs-runtime",
      () => {
        sequence += 1;
        return sequence;
      }
    );
    const queue = new InProcessObservationQueue({
      adapterId: DESKTOP_OBSERVATION_ADAPTER_ID,
      protectedApps
    });

    for (const input of inputs) queue.enqueue(input);

    const stored: Event[] = [];
    const result = await queue.drain({
      upsertEvent(event) {
        stored.push(event);
        return true;
      }
    });

    expect(result.inserted).toBe(1);
    expect(result.warnings).toContain("Suppressed protected desktop app_focus observation.");
    expect(result.warnings).toContain("Deduped desktop window_focus observation.");
    expect(stored).toEqual([
      expect.objectContaining({
        source: expect.objectContaining({
          kind: "desktop",
          pointer: "desktop://app-focus/obs-runtime#1"
        }),
        context: {
          app: "1Password"
        },
        type: "app_focus",
        privacy: expect.objectContaining({
          redactionState: "redacted"
        })
      })
    ]);
    expect(JSON.stringify(stored)).not.toContain("Private vault");
    expect(JSON.stringify(stored)).not.toContain("API token");
  });
});
