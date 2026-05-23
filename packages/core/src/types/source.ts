import type { PermissionScope, Sensitivity, SourceKind } from "./common";
import type { Event } from "./event";

export type SourceCapability =
  | "incremental_read"
  | "thread_metadata"
  | "attachments"
  | "raw_export"
  | "delete_detection";

export interface AdapterReadResult {
  events: Event[];
  nextCursor?: string;
  warnings?: string[];
  audit?: AdapterReadAuditEntry[];
}

export interface AdapterReadAuditEntry {
  operation: string;
  protectedRuleId?: string;
  protectedReason?: string;
  protectedContentDropped?: number;
}

export interface SourceAdapter {
  id: string;
  kind: SourceKind;
  displayName: string;
  capabilities: readonly SourceCapability[];
  defaultSensitivity: Sensitivity;
  permissionScope: PermissionScope;
  readCursor(cursor?: string): Promise<AdapterReadResult>;
}

export interface SourceRecord {
  id: string;
  kind: SourceKind;
  displayName: string;
  enabled: boolean;
  paused: boolean;
  defaultSensitivity: Sensitivity;
  permissionScope: PermissionScope;
  lastSyncAt?: string;
  lastEventAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export function defaultPermissionScopeForSource(
  sourceKind: SourceKind,
  sensitivity: Sensitivity
): PermissionScope {
  const isConfidential = sensitivity === "confidential" || sensitivity === "secret";
  return {
    sourceKind,
    readableFields: [
      "title",
      "summary",
      "text",
      "timestamp",
      "actor",
      "app",
      "project",
      "thread"
    ],
    canStoreRaw: false,
    canStoreSummary: true,
    canUseForAI: !isConfidential,
    canExportToAgent: sensitivity !== "secret",
    retentionPolicyId: "default"
  };
}
