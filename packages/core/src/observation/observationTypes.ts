import type { SourceKind, Sensitivity } from "../types/common";

export type ObservationTier = "tier1" | "tier2" | "tier3";

export type ObservationRuntimeStatus =
  | "not_configured"
  | "needs_permission"
  | "ready"
  | "collecting"
  | "paused"
  | "warning"
  | "error"
  | "disabled";

export type ObservationSourceKind =
  | "desktop"
  | "accessibility"
  | "browser"
  | "terminal"
  | "clipboard"
  | "filesystem"
  | "screen"
  | "ocr"
  | "audio"
  | "transcript";

export type ObservationInputType =
  | "app_focus"
  | "window_focus"
  | "window_title_change"
  | "accessibility_snapshot"
  | "browser_navigation"
  | "terminal_command"
  | "terminal_output_summary"
  | "clipboard_change"
  | "file_activity"
  | "screen_observation"
  | "ocr_text"
  | "audio_segment"
  | "transcript_segment"
  | "observation_state"
  | "permission_state";

export interface ObservationInput {
  id?: string;
  type: ObservationInputType;
  tier: ObservationTier;
  sourceKind: ObservationSourceKind;
  occurredAt: string;
  observedAt?: string;
  runtimeSessionId: string;
  sequence: number;
  app?: {
    name: string;
    bundleId?: string;
    pid?: number;
    isProtected?: boolean;
  };
  window?: {
    title?: string;
    titleHash?: string;
    isPrivate?: boolean;
  };
  browser?: {
    url?: string;
    title?: string;
    profileId?: string;
  };
  terminal?: {
    sessionId: string;
    commandIndex: number;
    command?: string;
    cwd?: string;
    exitCode?: number;
  };
  clipboard?: {
    contentType: "text" | "image" | "file" | "url" | "unknown";
    contentHash: string;
    redactedSummary?: string;
  };
  file?: {
    rootId: string;
    relativePath: string;
    operation: "created" | "modified" | "deleted" | "renamed";
    contentHash?: string;
  };
  accessibility?: {
    role?: string;
    focusedElementRole?: string;
    text?: string;
    textHash?: string;
    containsSecureField?: boolean;
  };
  screen?: {
    scopeKind: "display" | "app" | "window" | "region";
    scopeLabel?: string;
    frameHash: string;
    width?: number;
    height?: number;
    redactedSummary?: string;
    rawLocalRef?: string;
    sizeBytes?: number;
  };
  ocr?: {
    text?: string;
    textHash: string;
    languages: string[];
    engine: string;
    confidence?: number;
    sourceFrameHash?: string;
  };
  audio?: {
    scopeKind: "microphone" | "system_audio" | "mixed";
    scopeLabel?: string;
    segmentId: string;
    segmentHash: string;
    durationMs: number;
    redactedSummary?: string;
    rawLocalRef?: string;
    sizeBytes?: number;
  };
  transcript?: {
    text?: string;
    textHash: string;
    language?: string;
    confidence?: number;
    sourceSegmentHash?: string;
    provider?: string;
  };
  permission?: ObservationPermissionStatus;
  raw?: {
    text?: string;
    localRef?: string;
    sizeBytes?: number;
  };
}

export interface ObservationDrainResult {
  read: number;
  inserted: number;
  skipped: number;
  dropped: number;
  warnings: string[];
  lastEventAt?: string;
}

export interface ObservationStatus {
  status: ObservationRuntimeStatus;
  enabled: boolean;
  paused: boolean;
  activeRuntimeSessionId?: string;
  tiers: Record<ObservationTier, ObservationTierStatus>;
  permissions: ObservationPermissionStatus[];
  protectedApps: ProtectedAppRule[];
  allowedFolders: AllowedFolderRule[];
  lastStartedAt?: string;
  lastStoppedAt?: string;
  lastEventAt?: string;
  lastError?: string;
  queueDepth: number;
}

export interface ObservationTierStatus {
  enabled: boolean;
  status: ObservationRuntimeStatus;
  sourceKinds: ObservationSourceKind[];
  lastEventAt?: string;
  lastError?: string;
}

export interface ObservationPermissionStatus {
  kind: "accessibility" | "screen" | "microphone" | "system_audio" | "filesystem" | "automation";
  requiredFor: ObservationSourceKind[];
  status: "not_required" | "not_determined" | "granted" | "denied" | "restricted" | "unknown";
  canRequestFromApp: boolean;
  instructions?: string;
}

export interface ProtectedAppRule {
  id: string;
  match:
    | { kind: "bundle_id"; value: string }
    | { kind: "app_name"; value: string }
    | { kind: "window_title_pattern"; value: string };
  reason: "default_sensitive_app" | "user_added" | "private_window" | "password_field";
  enabled: boolean;
}

export interface AllowedFolderRule {
  id: string;
  rootPath: string;
  displayName: string;
  project?: string;
  enabled: boolean;
  includeGlobs: string[];
  excludeGlobs: string[];
  defaultSensitivity: Sensitivity;
}

export function observationSourceKindToCoreSourceKind(
  sourceKind: ObservationSourceKind
): SourceKind {
  return sourceKind;
}
