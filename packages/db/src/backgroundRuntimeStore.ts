import type Database from "better-sqlite3";
import {
  DEFAULT_BACKGROUND_RUNTIME_POLICY,
  mergeBackgroundRuntimePolicy,
  type BackgroundRuntimePolicy,
  type BackgroundSourceRuntimeState,
  type PartialBackgroundRuntimePolicy
} from "@orbit/core";
import { SettingsRepository } from "./repositories/settingsRepository";
import { SourceRepository } from "./repositories/sourceRepository";

const BACKGROUND_RUNTIME_POLICY_KEY = "backgroundRuntime.policy";
const BACKGROUND_SOURCE_STATES_KEY = "backgroundRuntime.sourceStates";

export type BackgroundSourceRuntimeSnapshotStatus =
  | "disabled"
  | "paused"
  | "backoff"
  | "error"
  | "scheduled";

export interface BackgroundSourceRuntimeSnapshot {
  sourceId: string;
  displayName: string;
  sourceKind: string;
  enabled: boolean;
  paused: boolean;
  status: BackgroundSourceRuntimeSnapshotStatus;
  intervalMs: number;
  consecutiveFailures: number;
  lastRunAt?: string;
  lastSuccessAt?: string;
  lastErrorAt?: string;
  lastError?: string;
  lastSkipAt?: string;
  lastSkipReason?: string;
  backoffUntil?: string;
  nextRunAt?: string;
}

export interface BackgroundRuntimeSnapshot {
  policy: BackgroundRuntimePolicy;
  sources: BackgroundSourceRuntimeSnapshot[];
}

export function readBackgroundRuntimePolicy(db: Database.Database): BackgroundRuntimePolicy {
  const settings = new SettingsRepository(db);
  return mergeBackgroundRuntimePolicy(
    settings.get<PartialBackgroundRuntimePolicy>(BACKGROUND_RUNTIME_POLICY_KEY)
  );
}

export function writeBackgroundRuntimePolicy(
  db: Database.Database,
  policy: PartialBackgroundRuntimePolicy
): void {
  new SettingsRepository(db).set(BACKGROUND_RUNTIME_POLICY_KEY, policy);
}

export function readBackgroundSourceRuntimeStates(
  db: Database.Database
): Record<string, BackgroundSourceRuntimeState> {
  return (
    new SettingsRepository(db).get<Record<string, BackgroundSourceRuntimeState>>(
      BACKGROUND_SOURCE_STATES_KEY
    ) ?? {}
  );
}

export function writeBackgroundSourceRuntimeStates(
  db: Database.Database,
  states: Record<string, BackgroundSourceRuntimeState>
): void {
  new SettingsRepository(db).set(BACKGROUND_SOURCE_STATES_KEY, states);
}

export function writeBackgroundSourceRuntimeState(
  db: Database.Database,
  state: BackgroundSourceRuntimeState
): void {
  const states = readBackgroundSourceRuntimeStates(db);
  states[state.sourceId] = state;
  writeBackgroundSourceRuntimeStates(db, states);
}

export function readBackgroundRuntimeSnapshot(db: Database.Database): BackgroundRuntimeSnapshot {
  const policy = readBackgroundRuntimePolicy(db);
  const states = readBackgroundSourceRuntimeStates(db);
  const sources = new SourceRepository(db).listSources();
  return {
    policy,
    sources: sources.map((source) => {
      const intervalMs = policy.perSourceIntervalMs[source.kind] ?? policy.defaultIntervalMs;
      const state: BackgroundSourceRuntimeState = {
        sourceId: source.id,
        intervalMs,
        consecutiveFailures: 0,
        ...states[source.id]
      };
      return {
        sourceId: source.id,
        displayName: source.displayName,
        sourceKind: source.kind,
        enabled: source.enabled,
        paused: source.paused,
        status: readSnapshotStatus(source.enabled, source.paused, state),
        intervalMs: state.intervalMs,
        consecutiveFailures: state.consecutiveFailures,
        ...(state.lastRunAt ? { lastRunAt: state.lastRunAt } : {}),
        ...(state.lastSuccessAt ? { lastSuccessAt: state.lastSuccessAt } : {}),
        ...(state.lastErrorAt ? { lastErrorAt: state.lastErrorAt } : {}),
        ...(state.lastError ? { lastError: state.lastError } : {}),
        ...(state.lastSkipAt ? { lastSkipAt: state.lastSkipAt } : {}),
        ...(state.lastSkipReason ? { lastSkipReason: state.lastSkipReason } : {}),
        ...(state.backoffUntil ? { backoffUntil: state.backoffUntil } : {}),
        ...(state.nextRunAt ? { nextRunAt: state.nextRunAt } : {})
      };
    })
  };
}

export function defaultBackgroundRuntimePolicy(): BackgroundRuntimePolicy {
  return DEFAULT_BACKGROUND_RUNTIME_POLICY;
}

function readSnapshotStatus(
  enabled: boolean,
  paused: boolean,
  state: BackgroundSourceRuntimeState
): BackgroundSourceRuntimeSnapshotStatus {
  if (!enabled) return "disabled";
  if (paused) return "paused";
  if (state.backoffUntil) return "backoff";
  if (state.lastError) return "error";
  return "scheduled";
}
