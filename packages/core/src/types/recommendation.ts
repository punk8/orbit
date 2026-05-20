import type { EvidenceRef, ID } from "./common";

export type RecommendationType =
  | "follow_up"
  | "risk"
  | "blocker"
  | "automation_opportunity"
  | "recurring_pattern"
  | "context_needed";

export interface Recommendation {
  id: ID;
  schemaVersion: number;
  type: RecommendationType;
  title: string;
  explanation: string;
  suggestedAction: string;
  confidence: number;
  impact: "low" | "medium" | "high";
  status: "new" | "accepted" | "dismissed" | "snoozed" | "resolved";
  evidence: EvidenceRef[];
  createdAt: string;
  dueAt?: string;
}
