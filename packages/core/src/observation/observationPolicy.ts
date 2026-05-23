import type { PermissionScope } from "../types/common";
import type { ObservationInput, ObservationSourceKind, ProtectedAppRule } from "./observationTypes";

export const DESKTOP_OBSERVATION_ADAPTER_ID = "desktop_observation";

export const DEFAULT_PROTECTED_APP_RULES: ProtectedAppRule[] = [
  protectedBundle("com.apple.keychainaccess"),
  protectedBundle("com.apple.systempreferences"),
  protectedBundle("com.apple.systemsettings"),
  protectedBundle("com.apple.Passwords"),
  protectedBundle("com.1password.1password"),
  protectedBundle("com.agilebits.onepassword7"),
  protectedBundle("com.lastpass.LastPass"),
  protectedBundle("com.dashlane.dashlanephonefinal"),
  protectedBundle("com.bitwarden.desktop"),
  protectedBundle("com.roboform.roboform"),
  protectedBundle("com.nordpass.NordPass"),
  protectedBundle("com.enpass.desktop"),
  protectedWindow(
    "protected_window_private_browser",
    "private\\s+(browsing|window)|incognito",
    "private_window"
  ),
  protectedWindow(
    "protected_window_auth_otp_secret",
    "\\b(otp|one[- ]?time|2fa|mfa|verification code|authenticator|password|passkey|secret|token|api[_ -]?key|private key)\\b",
    "authentication_or_otp"
  ),
  protectedDomain(
    "protected_domain_financial_and_payment",
    "(^|\\.)(bank|chase|wellsfargo|bankofamerica|capitalone|citi|paypal|stripe|wise|venmo|coinbase)\\.",
    "financial_or_payment"
  ),
  protectedDomain(
    "protected_domain_authentication",
    "(^|\\.)(auth|login|accounts|signin|id|sso|okta|auth0|1password|bitwarden)\\.",
    "authentication_or_otp"
  ),
  protectedText(
    "protected_text_secret_like_terminal_or_config",
    "([A-Z0-9_]*API[_-]?KEY\\s*[:=]|authorization:\\s*bearer\\s+|secret\\s*[:=]|token\\s*[:=]|-----BEGIN [A-Z ]*PRIVATE KEY-----|(^|[\\s/])\\.env\\b|(^|[\\s/])\\.npmrc\\b|(^|[\\s/])\\.netrc\\b)",
    "secret_like_content"
  )
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
  return getProtectedObservationMatch(input, rules) !== undefined;
}

export interface ProtectedObservationMatch {
  ruleId: string;
  reason: ProtectedAppRule["reason"] | "private_window" | "password_field";
  matchKind: ProtectedAppRule["match"]["kind"] | "window_private_flag" | "secure_field_flag";
}

export function getProtectedObservationMatch(
  input: ObservationInput,
  rules: ProtectedAppRule[] = DEFAULT_PROTECTED_APP_RULES
): ProtectedObservationMatch | undefined {
  if (input.app?.isProtected) {
    return {
      ruleId: "protected_input_app_flag",
      reason: "default_sensitive_app",
      matchKind: "app_name"
    };
  }
  if (input.window?.isPrivate) {
    return {
      ruleId: "protected_input_private_window_flag",
      reason: "private_window",
      matchKind: "window_private_flag"
    };
  }
  if (input.accessibility?.containsSecureField) {
    return {
      ruleId: "protected_input_secure_field_flag",
      reason: "password_field",
      matchKind: "secure_field_flag"
    };
  }
  const rule = rules.find(
    (candidate) => candidate.enabled && matchesProtectedRule(input, candidate)
  );
  if (!rule) return undefined;
  return {
    ruleId: rule.id,
    reason: rule.reason,
    matchKind: rule.match.kind
  };
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
    return matchPattern(input.window?.title, rule.match.value);
  }
  if (rule.match.kind === "domain_pattern") {
    return matchPattern(domainFromUrl(input.browser?.url), rule.match.value);
  }
  if (rule.match.kind === "url_pattern") {
    return matchPattern(input.browser?.url, rule.match.value);
  }
  if (rule.match.kind === "text_pattern") {
    return [
      input.window?.title,
      input.browser?.title,
      input.terminal?.command,
      input.accessibility?.text,
      input.ocr?.text,
      input.transcript?.text,
      input.raw?.text
    ].some((value) => matchPattern(value, rule.match.value));
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

function protectedWindow(
  id: string,
  value: string,
  reason: ProtectedAppRule["reason"]
): ProtectedAppRule {
  return {
    id,
    match: { kind: "window_title_pattern", value },
    reason,
    enabled: true
  };
}

function protectedDomain(
  id: string,
  value: string,
  reason: ProtectedAppRule["reason"]
): ProtectedAppRule {
  return {
    id,
    match: { kind: "domain_pattern", value },
    reason,
    enabled: true
  };
}

function protectedText(
  id: string,
  value: string,
  reason: ProtectedAppRule["reason"]
): ProtectedAppRule {
  return {
    id,
    match: { kind: "text_pattern", value },
    reason,
    enabled: true
  };
}

function matchPattern(value: string | undefined, pattern: string): boolean {
  if (!value) return false;
  try {
    return new RegExp(pattern, "i").test(value);
  } catch {
    return value.toLowerCase().includes(pattern.toLowerCase());
  }
}

function domainFromUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

function normalize(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}
