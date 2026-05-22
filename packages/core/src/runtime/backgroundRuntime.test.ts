import { describe, expect, it } from "vitest";
import type { SourceRecord } from "../types/source";
import { defaultPermissionScopeForSource } from "../types/source";
import {
  DEFAULT_BACKGROUND_RUNTIME_POLICY,
  planBackgroundRuntimeCycle,
  recordBackgroundSourceFailure,
  recordBackgroundSourceSuccess
} from "./backgroundRuntime";

const NOW = "2026-05-22T10:00:00.000Z";

describe("background runtime scheduler", () => {
  it("skips sources until their per-source interval has elapsed", () => {
    const source = makeSource("codex_recent", "codex");
    const cycle = planBackgroundRuntimeCycle({
      sources: [source],
      states: {
        [source.id]: {
          sourceId: source.id,
          intervalMs: 120_000,
          consecutiveFailures: 0,
          lastRunAt: "2026-05-22T09:59:30.000Z",
          lastSuccessAt: "2026-05-22T09:59:30.000Z"
        }
      },
      policy: {
        ...DEFAULT_BACKGROUND_RUNTIME_POLICY,
        defaultIntervalMs: 60_000,
        perSourceIntervalMs: { codex: 120_000 }
      },
      now: NOW,
      supportedSourceKinds: ["codex"]
    });

    expect(cycle.runnable).toHaveLength(0);
    expect(cycle.skipped).toMatchObject([
      {
        sourceId: source.id,
        reason: "interval_not_due",
        nextRunAt: "2026-05-22T10:01:30.000Z"
      }
    ]);
    expect(cycle.sourceStates[source.id]?.lastSkipReason).toBe("interval_not_due");
  });

  it("puts failed sources into backoff without blocking healthy due sources", () => {
    const failed = makeSource("codex_failed", "codex");
    const healthy = makeSource("agent_due", "local_agent");
    const failedState = recordBackgroundSourceFailure(
      {
        sourceId: failed.id,
        intervalMs: 60_000,
        consecutiveFailures: 1,
        lastRunAt: "2026-05-22T09:59:50.000Z"
      },
      {
        now: NOW,
        error: "Missing adapter path",
        policy: DEFAULT_BACKGROUND_RUNTIME_POLICY
      }
    );

    const cycle = planBackgroundRuntimeCycle({
      sources: [failed, healthy],
      states: { [failed.id]: failedState },
      policy: DEFAULT_BACKGROUND_RUNTIME_POLICY,
      now: "2026-05-22T10:00:10.000Z",
      supportedSourceKinds: ["codex", "local_agent"]
    });

    expect(cycle.runnable.map((decision) => decision.sourceId)).toEqual([healthy.id]);
    expect(cycle.skipped).toMatchObject([
      {
        sourceId: failed.id,
        reason: "failure_backoff",
        nextRunAt: failedState.backoffUntil
      }
    ]);
    expect(cycle.sourceStates[failed.id]?.consecutiveFailures).toBe(2);
  });

  it("enforces local resource and batch budgets as explainable policy blocks", () => {
    const first = makeSource("fixture_codex", "codex");
    const second = makeSource("fixture_seatalk", "seatalk");
    const lowPowerCycle = planBackgroundRuntimeCycle({
      sources: [first, second],
      states: {},
      policy: {
        ...DEFAULT_BACKGROUND_RUNTIME_POLICY,
        resourceLimits: {
          ...DEFAULT_BACKGROUND_RUNTIME_POLICY.resourceLimits,
          lowPowerMode: true
        }
      },
      now: NOW,
      supportedSourceKinds: ["codex", "seatalk"]
    });

    expect(lowPowerCycle.runnable).toHaveLength(0);
    expect(lowPowerCycle.skipped.map((decision) => decision.reason)).toEqual([
      "resource_limited",
      "resource_limited"
    ]);

    const batchCycle = planBackgroundRuntimeCycle({
      sources: [first, second],
      states: {},
      policy: {
        ...DEFAULT_BACKGROUND_RUNTIME_POLICY,
        maxSourcesPerCycle: 1
      },
      now: NOW,
      supportedSourceKinds: ["codex", "seatalk"]
    });

    expect(batchCycle.runnable.map((decision) => decision.sourceId)).toEqual([first.id]);
    expect(batchCycle.skipped).toMatchObject([
      {
        sourceId: second.id,
        reason: "cycle_budget_exhausted"
      }
    ]);
  });

  it("clears failure backoff after a later successful run", () => {
    const source = makeSource("codex", "codex");
    const failed = recordBackgroundSourceFailure(
      {
        sourceId: source.id,
        intervalMs: 60_000,
        consecutiveFailures: 2,
        lastError: "boom"
      },
      {
        now: NOW,
        error: "boom again",
        policy: DEFAULT_BACKGROUND_RUNTIME_POLICY
      }
    );

    const recovered = recordBackgroundSourceSuccess(failed, {
      now: "2026-05-22T10:10:00.000Z",
      intervalMs: 60_000
    });

    expect(recovered.consecutiveFailures).toBe(0);
    expect(recovered.lastError).toBeUndefined();
    expect(recovered.backoffUntil).toBeUndefined();
    expect(recovered.nextRunAt).toBe("2026-05-22T10:11:00.000Z");
  });
});

function makeSource(id: string, kind: SourceRecord["kind"]): SourceRecord {
  const now = "2026-05-22T09:00:00.000Z";
  return {
    id,
    kind,
    displayName: id,
    enabled: true,
    paused: false,
    defaultSensitivity: "internal",
    permissionScope: defaultPermissionScopeForSource(kind, "internal"),
    createdAt: now,
    updatedAt: now
  };
}
