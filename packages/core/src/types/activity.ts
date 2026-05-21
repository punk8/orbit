import type { EvidenceRef, ID, Sensitivity, SourceKind } from "./common";

export interface ActivitySourcePolicySnapshot {
  sourceAdapterId: ID;
  sourceKind: SourceKind;
  canStoreRaw: boolean;
  canStoreSummary: boolean;
  canUseForAI: boolean;
  canExportToAgent: boolean;
  retentionPolicyId: string;
}

export interface ActivitySession {
  id: ID;
  schemaVersion: number;
  title: string;
  startAt: string;
  endAt: string;
  durationSeconds: number;
  sourceKinds: SourceKind[];
  apps: string[];
  eventCount: number;
  eventIds: ID[];
  topic?: string;
  project?: string;
  summary?: string;
  evidence: EvidenceRef[];
  media?: {
    screenshotRefs?: string[];
    recordingRefs?: string[];
    transcriptRefs?: string[];
  };
  localState: {
    rawAvailable: boolean;
    indexed: boolean;
    storageBytes?: number;
    closed?: boolean;
    closeReason?: "idle" | "explicit_boundary" | "historical";
    sourcePolicies?: ActivitySourcePolicySnapshot[];
  };
  privacy: {
    sensitivity: Sensitivity;
    retentionPolicyId: string;
  };
  createdAt: string;
  updatedAt: string;
}
