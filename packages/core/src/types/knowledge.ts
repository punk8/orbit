import type { EvidenceRef, FollowUp, ID, ReviewStatus } from "./common";

export type KnowledgeArtifactType =
  | "daily_brief"
  | "weekly_review"
  | "meeting_summary"
  | "debugging_note"
  | "decision_record"
  | "project_context"
  | "follow_up_list"
  | "custom";

export interface KnowledgeArtifact {
  id: ID;
  schemaVersion: number;
  type: KnowledgeArtifactType;
  title: string;
  status: ReviewStatus;
  metadata: {
    timeWindow?: { startAt: string; endAt: string };
    apps: string[];
    projects: string[];
    sourceSessionIds: ID[];
    generatedBy?: string;
    language?: string;
    evidenceState?: "available" | "unavailable" | "partial";
    evidenceUnavailableReason?: "source_events_deleted" | "raw_sidecar_deleted" | "source_disabled";
  };
  content: {
    description: string;
    keyInsights: string[];
    decisions?: string[];
    blockers?: string[];
    followUps?: FollowUp[];
    markdown: string;
  };
  evidence: EvidenceRef[];
  memoryCandidateIds?: ID[];
  confidence: number;
  createdAt: string;
  updatedAt: string;
}
