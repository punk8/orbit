export type ID = string;

export type SourceKind =
  | "codex"
  | "local_agent"
  | "seatalk"
  | "screen"
  | "calendar"
  | "mail"
  | "docs"
  | "jira"
  | "gitlab"
  | "filesystem";

export type Sensitivity = "public" | "internal" | "confidential" | "secret";

export type ReviewStatus = "draft" | "needs_review" | "confirmed" | "rejected" | "archived";

export interface EvidenceRef {
  eventId?: ID;
  activitySessionId?: ID;
  artifactId?: ID;
  sourceKind: SourceKind;
  sourcePointer: string;
  timestamp: string;
  excerpt?: string;
}

export interface AttachmentRef {
  id: ID;
  kind: "file" | "image" | "audio" | "video" | "link" | "other";
  name?: string;
  mimeType?: string;
  localRef?: string;
  sourcePointer?: string;
  sizeBytes?: number;
  hash?: string;
}

export interface FollowUp {
  id: ID;
  title: string;
  owner?: string;
  dueAt?: string;
  status: "open" | "done" | "dismissed";
  evidence: EvidenceRef[];
}

export interface Actor {
  id?: string;
  displayName?: string;
  role?: "user" | "teammate" | "agent" | "system";
}

export interface PrivacyPolicy {
  sensitivity: Sensitivity;
  retentionPolicyId: string;
}

export interface PermissionScope {
  sourceKind: SourceKind;
  readableFields: string[];
  canStoreRaw: boolean;
  canStoreSummary: boolean;
  canUseForAI: boolean;
  canExportToAgent: boolean;
  retentionPolicyId: string;
}
