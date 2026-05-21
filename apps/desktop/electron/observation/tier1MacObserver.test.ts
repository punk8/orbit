import { describe, expect, it } from "vitest";
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
});
