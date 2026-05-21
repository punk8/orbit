import type { PermissionScope } from "../types/common";
import type { ObservationInput, ObservationSourceKind, ProtectedAppRule } from "./observationTypes";

export const DESKTOP_OBSERVATION_ADAPTER_ID = "desktop_observation";

export const DEFAULT_PROTECTED_APP_RULES: ProtectedAppRule[] = [
  protectedBundle("com.apple.keychainaccess"),
  protectedBundle("com.apple.systempreferences"),
  protectedBundle("com.apple.systemsettings"),
  protectedBundle("com.1password.1password"),
  protectedBundle("com.agilebits.onepassword7"),
  protectedBundle("com.lastpass.LastPass"),
  protectedBundle("com.dashlane.dashlanephonefinal"),
  protectedBundle("com.bitwarden.desktop")
];

export function defaultProtectedAppRules(): ProtectedAppRule[] {
  return DEFAULT_PROTECTED_APP_RULES.map((rule) => ({
    ...rule,
    match: { ...rule.match }
  }));
}

export function isProtectedObservation(
  input: ObservationInput,
  rules: ProtectedAppRule[] = DEFAULT_PROTECTED_APP_RULES
): boolean {
  if (input.app?.isProtected) return true;
  if (input.window?.isPrivate) return true;
  if (input.accessibility?.containsSecureField) return true;
  return rules.some((rule) => rule.enabled && matchesProtectedRule(input, rule));
}

export function makeObservationPermissionScope(
  sourceKind: ObservationSourceKind
): PermissionScope {
  const canExportToAgent = sourceKind === "desktop" || sourceKind === "filesystem";
  return {
    sourceKind,
    readableFields: [
      "title",
      "summary",
      "timestamp",
      "actor",
      "app",
      "project",
      "thread",
      "window",
      "url"
    ],
    canStoreRaw: false,
    canStoreSummary: true,
    canUseForAI: false,
    canExportToAgent,
    retentionPolicyId: "observation_default"
  };
}

function matchesProtectedRule(input: ObservationInput, rule: ProtectedAppRule): boolean {
  if (rule.match.kind === "bundle_id") {
    return normalize(input.app?.bundleId) === normalize(rule.match.value);
  }
  if (rule.match.kind === "app_name") {
    return normalize(input.app?.name) === normalize(rule.match.value);
  }
  if (rule.match.kind === "window_title_pattern") {
    const title = input.window?.title;
    if (!title) return false;
    try {
      return new RegExp(rule.match.value, "i").test(title);
    } catch {
      return title.toLowerCase().includes(rule.match.value.toLowerCase());
    }
  }
  return false;
}

function protectedBundle(bundleId: string): ProtectedAppRule {
  return {
    id: `protected_bundle_${bundleId}`,
    match: { kind: "bundle_id", value: bundleId },
    reason: "default_sensitive_app",
    enabled: true
  };
}

function normalize(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}
