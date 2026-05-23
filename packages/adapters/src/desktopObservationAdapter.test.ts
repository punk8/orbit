import { describe, expect, it } from "vitest";
import type { Event, ObservationInput } from "@orbit/core";
import { DESKTOP_OBSERVATION_ADAPTER_ID } from "@orbit/core";
import { MockDesktopObservationSource } from "./desktop/mockDesktopObservationSource";
import { InProcessObservationQueue } from "./desktop/observationQueue";

describe("desktop observation mock adapter", () => {
  it("reads deterministic desktop observations into the observation queue", async () => {
    const source = new MockDesktopObservationSource(makeObservationInputs());
    const queue = new InProcessObservationQueue({
      adapterId: DESKTOP_OBSERVATION_ADAPTER_ID
    });

    const emitted = source.emitToQueue(queue);
    expect(emitted.read).toBe(7);
    expect(emitted.emitted).toBe(7);
    expect(queue.depth).toBe(6);

    const stored: Event[] = [];
    const result = await queue.drain({
      upsertEvent(event) {
        stored.push(event);
        return true;
      }
    });

    expect(result.inserted).toBe(6);
    expect(result.warnings.some((warning) => warning.startsWith("Deduped desktop "))).toBe(true);
    expect(stored.map((event) => event.source.pointer)).toEqual([
      "desktop://app-focus/obs-day-1#1",
      "desktop://window/obs-day-1#2",
      "desktop://app-focus/obs-day-1#3",
      "desktop://window/obs-day-1#4",
      "desktop://state/obs-day-1#5",
      "desktop://app-focus/obs-protected#1"
    ]);
  });

  it("does not persist protected app window titles", async () => {
    const source = new MockDesktopObservationSource(makeObservationInputs());
    const queue = new InProcessObservationQueue();
    source.emitToQueue(queue);

    const stored: Event[] = [];
    await queue.drain({
      upsertEvent(event) {
        stored.push(event);
        return true;
      }
    });

    const protectedEvents = stored.filter((event) => event.context.app === "1Password");
    expect(protectedEvents).toHaveLength(1);
    expect(protectedEvents.every((event) => event.context.windowTitle === undefined)).toBe(true);
    expect(JSON.stringify(protectedEvents)).not.toContain("Private vault");
    expect(JSON.stringify(protectedEvents)).not.toContain("API token");
  });

  it("dedupes repeated app/window focus events before draining", async () => {
    const queue = new InProcessObservationQueue({
      adapterId: DESKTOP_OBSERVATION_ADAPTER_ID,
      dedupeWindowMs: 60_000
    });
    queue.enqueue({
      type: "window_focus",
      tier: "tier1",
      sourceKind: "desktop",
      occurredAt: "2026-05-21T09:00:00.000Z",
      runtimeSessionId: "runtime-real",
      sequence: 1,
      app: { name: "Cursor", bundleId: "com.todesktop.230313mzl4w4u92" },
      window: { title: "orbit - Goal 2" }
    });
    queue.enqueue({
      type: "window_focus",
      tier: "tier1",
      sourceKind: "desktop",
      occurredAt: "2026-05-21T09:00:20.000Z",
      runtimeSessionId: "runtime-real",
      sequence: 2,
      app: { name: "Cursor", bundleId: "com.todesktop.230313mzl4w4u92" },
      window: { title: "orbit - Goal 2" }
    });
    queue.enqueue({
      type: "window_focus",
      tier: "tier1",
      sourceKind: "desktop",
      occurredAt: "2026-05-21T09:01:30.000Z",
      runtimeSessionId: "runtime-real",
      sequence: 3,
      app: { name: "Cursor", bundleId: "com.todesktop.230313mzl4w4u92" },
      window: { title: "orbit - Goal 2" }
    });

    const stored: Event[] = [];
    const result = await queue.drain({
      upsertEvent(event) {
        stored.push(event);
        return true;
      }
    });

    expect(result.inserted).toBe(2);
    expect(result.warnings).toContain("Deduped desktop window_focus observation.");
    expect(stored.map((event) => event.source.pointer)).toEqual([
      "desktop://window/runtime-real#1",
      "desktop://window/runtime-real#3"
    ]);
  });
});

function makeObservationInputs(): ObservationInput[] {
  return [
    {
      type: "app_focus",
      tier: "tier1",
      sourceKind: "desktop",
      occurredAt: "2026-05-21T09:00:00.000Z",
      runtimeSessionId: "obs-day-1",
      sequence: 1,
      app: { name: "Cursor", bundleId: "com.todesktop.230313mzl4w4u92" }
    },
    {
      type: "window_focus",
      tier: "tier1",
      sourceKind: "desktop",
      occurredAt: "2026-05-21T09:00:05.000Z",
      runtimeSessionId: "obs-day-1",
      sequence: 2,
      app: { name: "Cursor", bundleId: "com.todesktop.230313mzl4w4u92" },
      window: { title: "orbit - Activity" }
    },
    {
      type: "app_focus",
      tier: "tier1",
      sourceKind: "desktop",
      occurredAt: "2026-05-21T09:03:00.000Z",
      runtimeSessionId: "obs-day-1",
      sequence: 3,
      app: { name: "Terminal", bundleId: "com.apple.Terminal" }
    },
    {
      type: "window_focus",
      tier: "tier1",
      sourceKind: "desktop",
      occurredAt: "2026-05-21T09:03:05.000Z",
      runtimeSessionId: "obs-day-1",
      sequence: 4,
      app: { name: "Terminal", bundleId: "com.apple.Terminal" },
      window: { title: "pnpm test" }
    },
    {
      type: "observation_state",
      tier: "tier1",
      sourceKind: "desktop",
      occurredAt: "2026-05-21T09:04:00.000Z",
      runtimeSessionId: "obs-day-1",
      sequence: 5,
      app: { name: "Terminal", bundleId: "com.apple.Terminal" }
    },
    {
      type: "app_focus",
      tier: "tier1",
      sourceKind: "desktop",
      occurredAt: "2026-05-21T09:03:20.000Z",
      runtimeSessionId: "obs-day-1",
      sequence: 6,
      app: { name: "Terminal", bundleId: "com.apple.Terminal" }
    },
    {
      type: "app_focus",
      tier: "tier1",
      sourceKind: "desktop",
      occurredAt: "2026-05-21T09:05:00.000Z",
      runtimeSessionId: "obs-protected",
      sequence: 1,
      app: { name: "1Password", bundleId: "com.1password.1password", isProtected: true },
      window: { title: "Private vault API token" }
    }
  ];
}
