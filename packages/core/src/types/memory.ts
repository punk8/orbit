import type { EvidenceRef, ID, ReviewStatus, SourceKind } from "./common";

export type MemoryKind =
  | "project_fact"
  | "user_preference"
  | "decision"
  | "workflow_pattern"
  | "common_issue"
  | "relationship_context"
  | "domain_knowledge";

export interface Memory {
  id: ID;
  schemaVersion: number;
  kind: MemoryKind;
  title: string;
  body: string;
  status: ReviewStatus;
  scope: {
    global?: boolean;
    project?: string;
    sourceKinds?: SourceKind[];
  };
  tags: string[];
  evidence: EvidenceRef[];
  confidence: number;
  validFrom?: string;
  validUntil?: string;
  lastReviewedAt?: string;
  supersedes?: ID[];
  createdAt: string;
  updatedAt: string;
}
