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
  dimension: "project" | "user" | "workflow" | "relationship" | "domain" | "global";
  title: string;
  body: string;
  status: ReviewStatus;
  scope: {
    global?: boolean;
    project?: string;
    sourceKinds?: SourceKind[];
  };
  sourceSessionIds: ID[];
  tags: string[];
  evidence: EvidenceRef[];
  confidence: number;
  version: number;
  indexState: {
    provider: "local_embedding" | "local_endpoint" | "fts";
    status: "pending" | "indexed" | "failed" | "disabled";
    fallbackOrder: Array<"local_embedding" | "local_endpoint" | "fts">;
    updatedAt?: string;
  };
  validFrom?: string;
  validUntil?: string;
  lastReviewedAt?: string;
  supersedes?: ID[];
  createdAt: string;
  updatedAt: string;
}
