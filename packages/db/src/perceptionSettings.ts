import type Database from "better-sqlite3";
import {
  createDefaultPerceptionStatus,
  defaultPerceptionProviderRoutes,
  defaultProtectedAppRules,
  hashObject,
  isPerceptionProviderTask,
  isPerceptionSourceKind,
  normalizePerceptionProviderKind,
  type PerceptionControlPlaneStatus,
  type PerceptionProviderKind,
  type PerceptionProviderRoute,
  type PerceptionProviderTask,
  type PerceptionPermissionStatus,
  type PerceptionSamplingPresetName,
  type PerceptionSourceControl,
  type PerceptionSourceKind,
  type PerceptionSourcePolicyPatch,
  type PerceptionSourceRuntimeAction,
  type ProtectedAppRule,
  type StoredPerceptionSourceControl
} from "@orbit/core";
import { AuditRepository } from "./repositories/auditRepository";
import { SettingsRepository } from "./repositories/settingsRepository";
import { SourceRepository } from "./repositories/sourceRepository";

export const PERCEPTION_SOURCES_SETTING_KEY = "perception.sources";
export const PERCEPTION_PROVIDER_ROUTES_SETTING_KEY = "perception.providerRoutes";
export const PERCEPTION_SAMPLING_SETTING_KEY = "perception.sampling";
export const PROTECTED_APP_RULES_SETTING_KEY = "observation.protectedApps";

export interface ProtectedRuleInput {
  kind:
    | "bundle_id"
    | "app_name"
    | "window_title_pattern"
    | "domain_pattern"
    | "url_pattern"
    | "text_pattern";
  value: string;
  reason?: ProtectedAppRule["reason"];
  enabled?: boolean;
}

export interface IgnoreCurrentContextInput {
  appName?: string;
  bundleId?: string;
  windowTitle?: string;
}

export function readPerceptionStatusFromSettings(
  settings: SettingsRepository
): PerceptionControlPlaneStatus {
  return createDefaultPerceptionStatus(
    readStoredSources(settings),
    readStoredProviderRoutes(settings),
    readProtectedAppRules(settings),
    readStoredSamplingPolicy(settings)
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
            next.userIntent = "manual";
            next.lastPermissionCheckedAt = now;
          } else if (action === "disable") {
            next.enabled = false;
            next.paused = false;
            next.userIntent = "stopped";
          } else if (action === "pause") {
            assertEnabled(previousSource, action);
            next.enabled = true;
            next.paused = true;
            next.userIntent = "paused_user";
          } else if (action === "resume") {
            assertEnabled(previousSource, action);
            next.enabled = true;
            next.paused = false;
            next.userIntent = "auto";
            next.lastPermissionCheckedAt = now;
          }
          next.lastRuntimeChangedAt = now;
          return next;
        });

  writeStoredSources(settings, nextStoredSources);
  const next = readPerceptionStatusFromSettings(settings);
  const nextSource = requirePerceptionSource(next, sourceKind);
  audit.log(perceptionRuntimeAuditOperation(action), "perception_source", sourceKind, {
    policySnapshotId: next.policySnapshot.id,
    previous: summarizePerceptionSource(previousSource),
    next: summarizePerceptionSource(nextSource)
  });
  if (action === "enable" || action === "resume") {
    audit.log("perception.permission_checked", "perception_source", sourceKind, {
      policySnapshotId: next.policySnapshot.id,
      permissions: nextSource.permissionGates
    });
  }
  return next;
}

export function syncDogfoodRuntimePermission(
  db: Database.Database,
  permission: PerceptionPermissionStatus
): PerceptionControlPlaneStatus {
  const settings = new SettingsRepository(db);
  const audit = new AuditRepository(db);
  const now = new Date().toISOString();
  const previous = readPerceptionStatusFromSettings(settings);
  const storedSources = readStoredSources(settings);
  const screenOcrSources = ["screen", "ocr"] as const;
  const hasUserStopped = storedSources.some(
    (source) =>
      screenOcrSources.includes(source.sourceKind as "screen" | "ocr") &&
      source.userIntent === "stopped"
  );
  const hasUserPaused = storedSources.some(
    (source) =>
      screenOcrSources.includes(source.sourceKind as "screen" | "ocr") &&
      source.userIntent === "paused_user"
  );
  let nextStoredSources = storedSources;

  for (const sourceKind of screenOcrSources) {
    nextStoredSources = upsertStoredSource(nextStoredSources, sourceKind, (source) => {
      const next: StoredPerceptionSourceControl = {
        ...source,
        permissionStatuses: {
          ...(source.permissionStatuses ?? {}),
          screen: permission
        },
        lastPermissionCheckedAt: now
      };

      if (permission === "granted" && !hasUserStopped && !hasUserPaused) {
        next.enabled = true;
        next.paused = false;
        next.userIntent = "auto";
        next.lastRuntimeChangedAt = now;
      }

      return next;
    });
  }

  writeStoredSources(settings, nextStoredSources);
  const next = readPerceptionStatusFromSettings(settings);
  audit.log("perception.permission_checked", "perception_source", "screen", {
    policySnapshotId: next.policySnapshot.id,
    permission,
    previousRuntime: previous.dogfoodRuntime,
    nextRuntime: next.dogfoodRuntime
  });

  if (previous.dogfoodRuntime.permission !== "granted" && permission === "granted") {
    audit.log("perception.permission_granted", "perception_source", "screen", {
      policySnapshotId: next.policySnapshot.id,
      previousRuntime: previous.dogfoodRuntime,
      nextRuntime: next.dogfoodRuntime
    });
  }

  if (previous.dogfoodRuntime.state !== "observing" && next.dogfoodRuntime.state === "observing") {
    audit.log("perception.runtime_auto_started", "perception_runtime", "screen_ocr", {
      policySnapshotId: next.policySnapshot.id,
      previousRuntime: previous.dogfoodRuntime,
      nextRuntime: next.dogfoodRuntime
    });
  }

  if (previous.dogfoodRuntime.permission === "granted" && permission !== "granted") {
    audit.log("perception.permission_revoked", "perception_source", "screen", {
      policySnapshotId: next.policySnapshot.id,
      previousRuntime: previous.dogfoodRuntime,
      nextRuntime: next.dogfoodRuntime
    });
    audit.log("perception.runtime_stopped", "perception_runtime", "screen_ocr", {
      policySnapshotId: next.policySnapshot.id,
      previousRuntime: previous.dogfoodRuntime,
      nextRuntime: next.dogfoodRuntime,
      reason: "screen_recording_permission_revoked"
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
  syncPerceptionSourceRecordPolicy(db, nextSource);
  audit.log("perception.policy_changed", "perception_source", sourceKind, {
    policySnapshotId: next.policySnapshot.id,
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
  audit.log("perception.policy_changed", "perception_provider_route", task, {
    policySnapshotId: next.policySnapshot.id,
    previous: previousRoute,
    next: requireProviderRoute(next, task)
  });
  return next;
}

export function updatePerceptionSamplingPreset(
  db: Database.Database,
  preset: PerceptionSamplingPresetName
): PerceptionControlPlaneStatus {
  const settings = new SettingsRepository(db);
  const audit = new AuditRepository(db);
  const previous = readPerceptionStatusFromSettings(settings);
  settings.set(PERCEPTION_SAMPLING_SETTING_KEY, { preset });
  const next = readPerceptionStatusFromSettings(settings);
  audit.log("perception.policy_changed", "perception_sampling", preset, {
    policySnapshotId: next.policySnapshot.id,
    previous: previous.samplingPolicy,
    next: next.samplingPolicy
  });
  return next;
}

export function readProtectedAppRules(settings: SettingsRepository): ProtectedAppRule[] {
  const stored = settings.get<ProtectedAppRule[]>(PROTECTED_APP_RULES_SETTING_KEY);
  if (!Array.isArray(stored)) return defaultProtectedAppRules();
  return normalizeProtectedRules(stored);
}

export function upsertProtectedAppRule(
  db: Database.Database,
  input: ProtectedRuleInput
): PerceptionControlPlaneStatus {
  const settings = new SettingsRepository(db);
  const audit = new AuditRepository(db);
  const rule = protectedRuleFromInput(input);
  const nextRules = upsertProtectedRule(readProtectedAppRules(settings), rule);
  settings.set(PROTECTED_APP_RULES_SETTING_KEY, nextRules);
  const next = readPerceptionStatusFromSettings(settings);
  audit.log("perception.protected_rule_upserted", "protected_rule", rule.id, {
    policySnapshotId: next.policySnapshot.id,
    protectedRuleId: rule.id,
    protectedReason: rule.reason,
    matchKind: rule.match.kind,
    enabled: rule.enabled,
    valueHash: hashObject(rule.match.value).slice(0, 16)
  });
  return next;
}

export function ignoreCurrentPerceptionContextRule(
  db: Database.Database,
  input: IgnoreCurrentContextInput
): PerceptionControlPlaneStatus {
  const bundleId = input.bundleId?.trim();
  const appName = input.appName?.trim();
  const windowTitle = input.windowTitle?.trim();
  if (!bundleId && !appName && !windowTitle) {
    throw new Error("Ignoring the current context requires app or window metadata.");
  }
  const settings = new SettingsRepository(db);
  const audit = new AuditRepository(db);
  let rules = readProtectedAppRules(settings);
  const added: ProtectedAppRule[] = [];
  if (bundleId) {
    added.push(
      protectedRuleFromInput({
        kind: "bundle_id",
        value: bundleId,
        reason: "user_added"
      })
    );
  } else if (appName) {
    added.push(
      protectedRuleFromInput({
        kind: "app_name",
        value: appName,
        reason: "user_added"
      })
    );
  }
  if (windowTitle) {
    added.push(
      protectedRuleFromInput({
        kind: "window_title_pattern",
        value: `^${escapeRegExp(windowTitle)}$`,
        reason: "user_added"
      })
    );
  }
  for (const rule of added) {
    rules = upsertProtectedRule(rules, rule);
  }
  settings.set(PROTECTED_APP_RULES_SETTING_KEY, rules);
  const next = readPerceptionStatusFromSettings(settings);
  audit.log("perception.current_context_ignored", "protected_rule", "current_context", {
    policySnapshotId: next.policySnapshot.id,
    addedRuleIds: added.map((rule) => rule.id),
    protectedContentDropped: 0,
    valueHashes: added.map((rule) => hashObject(rule.match.value).slice(0, 16))
  });
  return next;
}

function perceptionRuntimeAuditOperation(action: PerceptionSourceRuntimeAction): string {
  if (action === "enable") return "perception.source_enabled";
  if (action === "disable") return "perception.source_disabled";
  if (action === "pause") return "perception.runtime_paused";
  if (action === "resume") return "perception.runtime_resumed";
  return "perception.source_disabled";
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

function protectedRuleFromInput(input: ProtectedRuleInput): ProtectedAppRule {
  const value = input.value.trim();
  if (!value) throw new Error("Protected rule value is required.");
  return {
    id: `protected_user_${input.kind}_${hashObject({
      kind: input.kind,
      value
    }).slice(0, 16)}`,
    match: makeProtectedRuleMatch(input.kind, value),
    reason: input.reason ?? "user_added",
    enabled: input.enabled ?? true
  };
}

function makeProtectedRuleMatch(
  kind: ProtectedRuleInput["kind"],
  value: string
): ProtectedAppRule["match"] {
  if (kind === "bundle_id") return { kind, value };
  if (kind === "app_name") return { kind, value };
  if (kind === "window_title_pattern") return { kind, value };
  if (kind === "domain_pattern") return { kind, value };
  if (kind === "url_pattern") return { kind, value };
  return { kind, value };
}

function normalizeProtectedRules(rules: ProtectedAppRule[]): ProtectedAppRule[] {
  const byId = new Map<string, ProtectedAppRule>();
  for (const rule of [...defaultProtectedAppRules(), ...rules]) {
    if (!isProtectedRuleMatch(rule.match) || !isProtectedReason(rule.reason)) continue;
    byId.set(rule.id, {
      id: rule.id,
      match: rule.match,
      reason: rule.reason,
      enabled: rule.enabled !== false
    });
  }
  return [...byId.values()];
}

function upsertProtectedRule(
  rules: ProtectedAppRule[],
  rule: ProtectedAppRule
): ProtectedAppRule[] {
  const index = rules.findIndex(
    (candidate) =>
      candidate.id === rule.id ||
      (candidate.match.kind === rule.match.kind && candidate.match.value === rule.match.value)
  );
  if (index < 0) return [...rules, rule];
  return rules.map((candidate, candidateIndex) => (candidateIndex === index ? rule : candidate));
}

function isProtectedRuleMatch(value: unknown): value is ProtectedAppRule["match"] {
  if (!value || typeof value !== "object") return false;
  const match = value as { kind?: unknown; value?: unknown };
  return (
    typeof match.value === "string" &&
    (match.kind === "bundle_id" ||
      match.kind === "app_name" ||
      match.kind === "window_title_pattern" ||
      match.kind === "domain_pattern" ||
      match.kind === "url_pattern" ||
      match.kind === "text_pattern")
  );
}

function isProtectedReason(value: unknown): value is ProtectedAppRule["reason"] {
  return (
    value === "default_sensitive_app" ||
    value === "user_added" ||
    value === "private_window" ||
    value === "password_field" ||
    value === "financial_or_payment" ||
    value === "authentication_or_otp" ||
    value === "secret_like_content"
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function readStoredSamplingPolicy(
  settings: SettingsRepository
): { preset?: PerceptionSamplingPresetName } {
  const stored = settings.get<{ preset?: unknown }>(PERCEPTION_SAMPLING_SETTING_KEY);
  if (
    stored?.preset === "conservative" ||
    stored?.preset === "balanced" ||
    stored?.preset === "intensive"
  ) {
    return { preset: stored.preset };
  }
  return {};
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

function syncPerceptionSourceRecordPolicy(
  db: Database.Database,
  source: PerceptionSourceControl
): void {
  const repository = new SourceRepository(db);
  const sourceRecord = repository
    .listSources()
    .find(
      (item) => item.id === `perception_${source.sourceKind}` || item.kind === source.sourceKind
    );
  if (!sourceRecord) return;
  repository.upsertSource({
    ...sourceRecord,
    defaultSensitivity: source.policy.sensitivity,
    permissionScope: {
      ...sourceRecord.permissionScope,
      sourceKind: sourceRecord.kind,
      canStoreRaw: source.policy.canStoreRaw,
      canStoreSummary: source.policy.canStoreSummary,
      canUseForAI: source.policy.canUseForAI,
      canExportToAgent: source.policy.canExportToAgent,
      retentionPolicyId: source.policy.retentionPolicyId
    },
    updatedAt: new Date().toISOString()
  });
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
