import type { Sensitivity, SourceKind } from "./common";
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
}

export interface SourceAdapter {
  id: string;
  kind: SourceKind;
  displayName: string;
  capabilities: readonly SourceCapability[];
  defaultSensitivity: Sensitivity;
  readCursor(cursor?: string): Promise<AdapterReadResult>;
}

export interface SourceRecord {
  id: string;
  kind: SourceKind;
  displayName: string;
  enabled: boolean;
  defaultSensitivity: Sensitivity;
  createdAt: string;
  updatedAt: string;
}
