import type { SourceKind } from "../types/common";
import type { SourceRecord } from "../types/source";

export type BackgroundRuntimeSkipReason =
  | "source_disabled"
  | "source_paused"
  | "unsupported_source"
  | "interval_not_due"
  | "failure_backoff"
  | "cycle_budget_exhausted"
  | "resource_limited";

export interface BackgroundSourceRuntimeState {
  sourceId: string;
  intervalMs: number;
  consecutiveFailures: number;
  lastRunAt?: string;
  lastSuccessAt?: string;
  lastErrorAt?: string;
  lastError?: string;
  lastSkipAt?: string;
  lastSkipReason?: BackgroundRuntimeSkipReason;
  backoffUntil?: string;
  nextRunAt?: string;
}

export interface BackgroundRuntimeResourceLimits {
  lowPowerMode: boolean;
  cpuPressure: "normal" | "limited";
  maxReadPerCycle: number;
  maxInsertedPerCycle: number;
}

export interface BackgroundRuntimePolicy {
  defaultIntervalMs: number;
  perSourceIntervalMs: Partial<Record<SourceKind, number>>;
  maxSourcesPerCycle: number;
  failureBackoffBaseMs: number;
  failureBackoffMaxMs: number;
  resourceLimits: BackgroundRuntimeResourceLimits;
}

export interface BackgroundRuntimeDecision {
  sourceId: string;
  sourceKind: SourceKind;
  displayName: string;
  action: "run" | "skip";
  reason?: BackgroundRuntimeSkipReason;
  intervalMs: number;
  lastRunAt?: string;
  lastSuccessAt?: string;
  lastError?: string;
  backoffUntil?: string;
  nextRunAt?: string;
}

export interface BackgroundRuntimeCyclePlan {
  runnable: BackgroundRuntimeDecision[];
  skipped: BackgroundRuntimeDecision[];
  sourceStates: Record<string, BackgroundSourceRuntimeState>;
  policy: BackgroundRuntimePolicy;
}

export const DEFAULT_BACKGROUND_RUNTIME_POLICY: BackgroundRuntimePolicy = {
  defaultIntervalMs: 5 * 60_000,
  perSourceIntervalMs: {
    codex: 60_000,
    local_agent: 60_000,
    seatalk: 5 * 60_000
  },
  maxSourcesPerCycle: 3,
  failureBackoffBaseMs: 60_000,
  failureBackoffMaxMs: 30 * 60_000,
  resourceLimits: {
    lowPowerMode: false,
    cpuPressure: "normal",
    maxReadPerCycle: 2_000,
    maxInsertedPerCycle: 500
  }
};

export function planBackgroundRuntimeCycle(input: {
  sources: SourceRecord[];
  states: Record<string, BackgroundSourceRuntimeState | undefined>;
  policy?: PartialBackgroundRuntimePolicy | undefined;
  now?: string | undefined;
  supportedSourceKinds: SourceKind[];
}): BackgroundRuntimeCyclePlan {
  const now = input.now ?? new Date().toISOString();
  const policy = mergeBackgroundRuntimePolicy(input.policy);
  const supportedSourceKinds = new Set(input.supportedSourceKinds);
  const runnable: BackgroundRuntimeDecision[] = [];
  const skipped: BackgroundRuntimeDecision[] = [];
  const sourceStates: Record<string, BackgroundSourceRuntimeState> = {};
  const resourceLimited =
    policy.resourceLimits.lowPowerMode || policy.resourceLimits.cpuPressure === "limited";

  for (const source of input.sources) {
    const state = withDefaults(source, input.states[source.id], policy);
    let decision: BackgroundRuntimeDecision | undefined;

    if (!source.enabled) {
      decision = skipDecision(source, state, "source_disabled", now);
    } else if (source.paused) {
      decision = skipDecision(source, state, "source_paused", now);
    } else if (!supportedSourceKinds.has(source.kind)) {
      decision = skipDecision(source, state, "unsupported_source", now);
    } else if (resourceLimited) {
      decision = skipDecision(source, state, "resource_limited", now);
    } else if (state.backoffUntil && state.backoffUntil > now) {
      decision = skipDecision(source, state, "failure_backoff", now);
    } else if (state.nextRunAt && state.nextRunAt > now) {
      decision = skipDecision(source, state, "interval_not_due", now);
    } else if (runnable.length >= policy.maxSourcesPerCycle) {
      decision = skipDecision(source, state, "cycle_budget_exhausted", now);
    }

    if (decision) {
      skipped.push(decision);
      sourceStates[source.id] = {
        ...state,
        lastSkipAt: now,
        lastSkipReason: decision.reason ?? "unsupported_source"
      };
      continue;
    }

    const runState: BackgroundSourceRuntimeState = omitUndefinedState({
      ...state,
      lastRunAt: now
    });
    delete runState.lastSkipAt;
    delete runState.lastSkipReason;
    runnable.push(runDecision(source, runState));
    sourceStates[source.id] = runState;
  }

  return { runnable, skipped, sourceStates, policy };
}

export function recordBackgroundSourceSuccess(
  previous: BackgroundSourceRuntimeState | undefined,
  input: {
    now?: string | undefined;
    intervalMs: number;
  }
): BackgroundSourceRuntimeState {
  const now = input.now ?? new Date().toISOString();
  return {
    sourceId: previous?.sourceId ?? "",
    intervalMs: input.intervalMs,
    consecutiveFailures: 0,
    lastRunAt: now,
    lastSuccessAt: now,
    nextRunAt: addMs(now, input.intervalMs)
  };
}

export function recordBackgroundSourceFailure(
  previous: BackgroundSourceRuntimeState | undefined,
  input: {
    now?: string | undefined;
    error: string;
    policy?: PartialBackgroundRuntimePolicy | undefined;
  }
): BackgroundSourceRuntimeState {
  const now = input.now ?? new Date().toISOString();
  const policy = mergeBackgroundRuntimePolicy(input.policy);
  const consecutiveFailures = (previous?.consecutiveFailures ?? 0) + 1;
  const backoffMs = Math.min(
    policy.failureBackoffBaseMs * 2 ** Math.max(0, consecutiveFailures - 1),
    policy.failureBackoffMaxMs
  );
  const intervalMs = previous?.intervalMs ?? policy.defaultIntervalMs;
  const backoffUntil = addMs(now, backoffMs);
  return {
    ...previous,
    sourceId: previous?.sourceId ?? "",
    intervalMs,
    consecutiveFailures,
    lastRunAt: now,
    lastErrorAt: now,
    lastError: input.error,
    backoffUntil,
    nextRunAt: backoffUntil
  };
}

export type PartialBackgroundRuntimePolicy = Partial<
  Omit<BackgroundRuntimePolicy, "resourceLimits" | "perSourceIntervalMs">
> & {
  perSourceIntervalMs?: Partial<Record<SourceKind, number>> | undefined;
  resourceLimits?: Partial<BackgroundRuntimeResourceLimits> | undefined;
};

export function mergeBackgroundRuntimePolicy(
  policy: PartialBackgroundRuntimePolicy | undefined
): BackgroundRuntimePolicy {
  return {
    ...DEFAULT_BACKGROUND_RUNTIME_POLICY,
    ...policy,
    perSourceIntervalMs: {
      ...DEFAULT_BACKGROUND_RUNTIME_POLICY.perSourceIntervalMs,
      ...policy?.perSourceIntervalMs
    },
    resourceLimits: {
      ...DEFAULT_BACKGROUND_RUNTIME_POLICY.resourceLimits,
      ...policy?.resourceLimits
    }
  };
}

function withDefaults(
  source: SourceRecord,
  state: BackgroundSourceRuntimeState | undefined,
  policy: BackgroundRuntimePolicy
): BackgroundSourceRuntimeState {
  const intervalMs = state?.intervalMs ?? policy.perSourceIntervalMs[source.kind] ?? policy.defaultIntervalMs;
  const nextRunAt =
    state?.nextRunAt ??
    (state?.lastRunAt ? addMs(state.lastRunAt, intervalMs) : undefined);
  return {
    sourceId: source.id,
    intervalMs,
    consecutiveFailures: state?.consecutiveFailures ?? 0,
    ...state,
    ...(nextRunAt ? { nextRunAt } : {})
  };
}

function skipDecision(
  source: SourceRecord,
  state: BackgroundSourceRuntimeState,
  reason: BackgroundRuntimeSkipReason,
  now: string
): BackgroundRuntimeDecision {
  const nextRunAt =
    reason === "interval_not_due" || reason === "failure_backoff"
      ? state.nextRunAt ?? state.backoffUntil
      : state.nextRunAt ?? addMs(now, state.intervalMs);
  return {
    ...baseDecision(source, state),
    action: "skip",
    reason,
    ...(nextRunAt ? { nextRunAt } : {})
  };
}

function runDecision(
  source: SourceRecord,
  state: BackgroundSourceRuntimeState
): BackgroundRuntimeDecision {
  return {
    ...baseDecision(source, state),
    action: "run"
  };
}

function baseDecision(
  source: SourceRecord,
  state: BackgroundSourceRuntimeState
): Omit<BackgroundRuntimeDecision, "action"> {
  return {
    sourceId: source.id,
    sourceKind: source.kind,
    displayName: source.displayName,
    intervalMs: state.intervalMs,
    ...(state.lastRunAt ? { lastRunAt: state.lastRunAt } : {}),
    ...(state.lastSuccessAt ? { lastSuccessAt: state.lastSuccessAt } : {}),
    ...(state.lastError ? { lastError: state.lastError } : {}),
    ...(state.backoffUntil ? { backoffUntil: state.backoffUntil } : {}),
    ...(state.nextRunAt ? { nextRunAt: state.nextRunAt } : {})
  };
}

function addMs(timestamp: string, ms: number): string {
  return new Date(new Date(timestamp).getTime() + ms).toISOString();
}

function omitUndefinedState(state: BackgroundSourceRuntimeState): BackgroundSourceRuntimeState {
  return Object.fromEntries(Object.entries(state).filter(([, value]) => value !== undefined)) as
    BackgroundSourceRuntimeState;
}
