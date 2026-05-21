import type Database from "better-sqlite3";
import {
  createDefaultPerceptionStatus,
  defaultPerceptionProviderRoutes,
  isPerceptionProviderTask,
  isPerceptionSourceKind,
  normalizePerceptionProviderKind,
  type PerceptionControlPlaneStatus,
  type PerceptionProviderKind,
  type PerceptionProviderRoute,
  type PerceptionProviderTask,
  type PerceptionSourceControl,
  type PerceptionSourceKind,
  type PerceptionSourcePolicyPatch,
  type PerceptionSourceRuntimeAction,
  type StoredPerceptionSourceControl
} from "@orbit/core";
import { AuditRepository } from "./repositories/auditRepository";
import { SettingsRepository } from "./repositories/settingsRepository";

export const PERCEPTION_SOURCES_SETTING_KEY = "perception.sources";
export const PERCEPTION_PROVIDER_ROUTES_SETTING_KEY = "perception.providerRoutes";

export function readPerceptionStatusFromSettings(
  settings: SettingsRepository
): PerceptionControlPlaneStatus {
  return createDefaultPerceptionStatus(
    readStoredSources(settings),
    readStoredProviderRoutes(settings)
  );
}

export function readPerceptionStatus(db: Database.Database): PerceptionControlPlaneStatus {
  return readPerceptionStatusFromSettings(new SettingsRepository(db));
}

export function updatePerceptionSourceRuntime(
  db: Database.Database,
  sourceKind: PerceptionSourceKind,
  action: PerceptionSourceRuntimeAction
): PerceptionControlPlaneStatus {
  const settings = new SettingsRepository(db);
  const audit = new AuditRepository(db);
  const now = new Date().toISOString();
  const previous = readPerceptionStatusFromSettings(settings);
  const previousSource = requirePerceptionSource(previous, sourceKind);
  const storedSources = readStoredSources(settings);
  const nextStoredSources =
    action === "delete"
      ? storedSources.filter((source) => source.sourceKind !== sourceKind)
      : upsertStoredSource(storedSources, sourceKind, (source) => {
          const next: StoredPerceptionSourceControl = { ...source };
          if (action === "enable") {
            next.enabled = true;
            next.paused = false;
            next.lastPermissionCheckedAt = now;
          } else if (action === "disable") {
            next.enabled = false;
            next.paused = false;
          } else if (action === "pause") {
            assertEnabled(previousSource, action);
            next.enabled = true;
            next.paused = true;
          } else if (action === "resume") {
            assertEnabled(previousSource, action);
            next.enabled = true;
            next.paused = false;
            next.lastPermissionCheckedAt = now;
          }
          next.lastRuntimeChangedAt = now;
          return next;
        });

  writeStoredSources(settings, nextStoredSources);
  const next = readPerceptionStatusFromSettings(settings);
  const nextSource = requirePerceptionSource(next, sourceKind);
  audit.log(`perception.${action}`, "perception_source", sourceKind, {
    previous: summarizePerceptionSource(previousSource),
    next: summarizePerceptionSource(nextSource)
  });
  if (action === "enable" || action === "resume") {
    audit.log("perception.permission_check", "perception_source", sourceKind, {
      permissions: nextSource.permissionGates
    });
  }
  return next;
}

export function updatePerceptionSourcePolicy(
  db: Database.Database,
  sourceKind: PerceptionSourceKind,
  patch: PerceptionSourcePolicyPatch
): PerceptionControlPlaneStatus {
  const settings = new SettingsRepository(db);
  const audit = new AuditRepository(db);
  const now = new Date().toISOString();
  const previous = readPerceptionStatusFromSettings(settings);
  const previousSource = requirePerceptionSource(previous, sourceKind);
  const storedSources = upsertStoredSource(readStoredSources(settings), sourceKind, (source) => ({
    ...source,
    policy: {
      ...(source.policy ?? {}),
      ...normalizePolicyPatch(patch)
    },
    lastPolicyChangedAt: now
  }));
  writeStoredSources(settings, storedSources);
  const next = readPerceptionStatusFromSettings(settings);
  const nextSource = requirePerceptionSource(next, sourceKind);
  audit.log("perception.policy_change", "perception_source", sourceKind, {
    previous: previousSource.policy,
    next: nextSource.policy
  });
  return next;
}

export function updatePerceptionProviderRoute(
  db: Database.Database,
  task: PerceptionProviderTask,
  provider: PerceptionProviderKind
): PerceptionControlPlaneStatus {
  const settings = new SettingsRepository(db);
  const audit = new AuditRepository(db);
  const previous = readPerceptionStatusFromSettings(settings);
  const previousRoute = requireProviderRoute(previous, task);
  const now = new Date().toISOString();
  const nextRoute: PerceptionProviderRoute = {
    task,
    provider,
    enabled: provider !== "disabled",
    allowExternal: provider === "openai-compatible",
    updatedAt: now
  };
  const routes = readStoredProviderRoutes(settings).filter((route) => route.task !== task);
  routes.push(nextRoute);
  writeStoredProviderRoutes(settings, routes);
  const next = readPerceptionStatusFromSettings(settings);
  audit.log("perception.provider_route.update", "perception_provider_route", task, {
    previous: previousRoute,
    next: requireProviderRoute(next, task)
  });
  return next;
}

export function readPerceptionSourceKind(value: unknown): PerceptionSourceKind {
  if (isPerceptionSourceKind(value)) return value;
  throw new Error(`Unsupported perception source: ${String(value)}`);
}

export function readPerceptionProviderTask(value: unknown): PerceptionProviderTask {
  if (isPerceptionProviderTask(value)) return value;
  throw new Error(`Unsupported perception provider task: ${String(value)}`);
}

export function readPerceptionProviderKind(value: unknown): PerceptionProviderKind {
  return normalizePerceptionProviderKind(value);
}

function readStoredSources(settings: SettingsRepository): StoredPerceptionSourceControl[] {
  return (settings.get<StoredPerceptionSourceControl[]>(PERCEPTION_SOURCES_SETTING_KEY) ?? [])
    .filter((source) => isPerceptionSourceKind(source.sourceKind))
    .map((source) => ({ ...source }));
}

function writeStoredSources(
  settings: SettingsRepository,
  sources: StoredPerceptionSourceControl[]
): void {
  settings.set(PERCEPTION_SOURCES_SETTING_KEY, sources);
}

function readStoredProviderRoutes(settings: SettingsRepository): PerceptionProviderRoute[] {
  const defaults = defaultPerceptionProviderRoutes.map((route) => ({ ...route }));
  const stored = settings.get<PerceptionProviderRoute[]>(PERCEPTION_PROVIDER_ROUTES_SETTING_KEY);
  if (!stored) return defaults;
  const storedByTask = new Map(
    stored
      .filter((route) => isPerceptionProviderTask(route.task))
      .map((route) => [route.task, route])
  );
  return defaults.map((route) => storedByTask.get(route.task) ?? route);
}

function writeStoredProviderRoutes(
  settings: SettingsRepository,
  routes: PerceptionProviderRoute[]
): void {
  settings.set(PERCEPTION_PROVIDER_ROUTES_SETTING_KEY, routes);
}

function upsertStoredSource(
  sources: StoredPerceptionSourceControl[],
  sourceKind: PerceptionSourceKind,
  update: (source: StoredPerceptionSourceControl) => StoredPerceptionSourceControl
): StoredPerceptionSourceControl[] {
  const index = sources.findIndex((source) => source.sourceKind === sourceKind);
  const existing = index >= 0 ? sources[index]! : { sourceKind };
  const next = update(existing);
  if (index >= 0) {
    return sources.map((source, sourceIndex) => (sourceIndex === index ? next : source));
  }
  return [...sources, next];
}

function requirePerceptionSource(
  status: PerceptionControlPlaneStatus,
  sourceKind: PerceptionSourceKind
): PerceptionSourceControl {
  const source = status.sources.find((item) => item.sourceKind === sourceKind);
  if (!source) throw new Error(`Unknown perception source: ${sourceKind}`);
  return source;
}

function requireProviderRoute(
  status: PerceptionControlPlaneStatus,
  task: PerceptionProviderTask
): PerceptionProviderRoute {
  const route = status.providerRoutes.find((item) => item.task === task);
  if (!route) throw new Error(`Unknown perception provider task: ${task}`);
  return route;
}

function assertEnabled(source: PerceptionSourceControl, action: string): void {
  if (!source.enabled) {
    throw new Error(`Cannot ${action} disabled perception source: ${source.sourceKind}`);
  }
}

function normalizePolicyPatch(patch: PerceptionSourcePolicyPatch): PerceptionSourcePolicyPatch {
  const next: PerceptionSourcePolicyPatch = { ...patch };
  if (next.rawRetentionTtlMinutes !== undefined && next.rawRetentionTtlMinutes !== null) {
    const ttl = Number(next.rawRetentionTtlMinutes);
    next.rawRetentionTtlMinutes = Number.isFinite(ttl) && ttl > 0 ? Math.round(ttl) : null;
  }
  if (next.canStoreRaw === true && next.rawRetentionTtlMinutes === undefined) {
    next.rawRetentionTtlMinutes = 60;
  }
  if (next.canStoreRaw === false) {
    next.rawRetentionTtlMinutes = null;
  }
  return next;
}

function summarizePerceptionSource(source: PerceptionSourceControl): object {
  return {
    sourceKind: source.sourceKind,
    enabled: source.enabled,
    paused: source.paused,
    status: source.status,
    permissions: source.permissionGates.map((permission) => ({
      kind: permission.kind,
      status: permission.status
    })),
    policy: source.policy
  };
}
