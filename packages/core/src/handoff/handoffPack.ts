import type {
  ActivitySession,
  EvidenceRef,
  KnowledgeArtifact,
  Memory,
  Recommendation,
  Sensitivity,
  SourceKind
} from "../index";
import { createStableId } from "../id";

export type HandoffKind = "today" | "project";

export type HandoffExclusionReason =
  | "draft_knowledge"
  | "memory_not_confirmed"
  | "recommendation_terminal"
  | "missing_evidence"
  | "secret_content"
  | "failed_redaction"
  | "source_export_blocked";

export interface HandoffEventSafety {
  eventId: string;
  sourceAdapterId: string;
  sourceKind: SourceKind;
  sourcePointer: string;
  timestamp: string;
  sensitivity: Sensitivity;
  redactionState: "none" | "redacted" | "failed";
  canExportToAgent: boolean;
}

export interface HandoffPack {
  schemaVersion: 1;
  id: string;
  kind: HandoffKind;
  objective: string;
  generatedAt: string;
  date?: string;
  project?: string;
  currentState: string[];
  recentActivity: HandoffActivityItem[];
  confirmedKnowledge: HandoffKnowledgeItem[];
  activeMemories: HandoffMemoryItem[];
  decisions: HandoffDecisionItem[];
  blockersAndRisks: HandoffRiskItem[];
  recommendedNextActions: HandoffRecommendationItem[];
  safetyBoundaries: HandoffSafetyBoundary[];
  evidenceIndex: HandoffEvidenceItem[];
  excluded: HandoffExclusion[];
}

export interface HandoffActivityItem {
  id: string;
  title: string;
  summary?: string;
  startAt: string;
  endAt: string;
  project?: string;
  apps: string[];
  sourceKinds: SourceKind[];
  evidenceIds: string[];
}

export interface HandoffKnowledgeItem {
  id: string;
  title: string;
  type: string;
  description: string;
  keyInsights: string[];
  projects: string[];
  confidence: number;
  evidenceIds: string[];
}

export interface HandoffMemoryItem {
  id: string;
  title: string;
  kind: string;
  body: string;
  scope: Memory["scope"];
  tags: string[];
  confidence: number;
  evidenceIds: string[];
}

export interface HandoffDecisionItem {
  id: string;
  title: string;
  sourceObjectId: string;
  sourceObjectType: "knowledge" | "memory";
  evidenceIds: string[];
}

export interface HandoffRiskItem {
  id: string;
  title: string;
  impact?: Recommendation["impact"];
  suggestedAction?: string;
  sourceObjectId: string;
  sourceObjectType: "knowledge" | "recommendation";
  evidenceIds: string[];
}

export interface HandoffRecommendationItem {
  id: string;
  title: string;
  type: Recommendation["type"];
  explanation: string;
  suggestedAction: string;
  confidence: number;
  impact: Recommendation["impact"];
  status: Recommendation["status"];
  evidenceIds: string[];
}

export interface HandoffSafetyBoundary {
  kind:
    | "review_required"
    | "no_side_effects"
    | "no_raw_payloads"
    | "source_export_policy"
    | "local_only";
  title: string;
  description: string;
}

export interface HandoffEvidenceItem {
  id: string;
  sourceKind: SourceKind;
  sourcePointer: string;
  timestamp: string;
  objectType: "activity" | "knowledge" | "memory" | "recommendation";
  objectId: string;
}

export interface HandoffExclusion {
  objectType: "activity" | "knowledge" | "memory" | "recommendation";
  objectId: string;
  reason: HandoffExclusionReason;
}

export interface BuildHandoffPackInput {
  kind: HandoffKind;
  objective: string;
  generatedAt: string;
  date?: string;
  project?: string;
  activitySessions: ActivitySession[];
  knowledgeArtifacts: KnowledgeArtifact[];
  memories: Memory[];
  recommendations: Recommendation[];
  eventSafety: Map<string, HandoffEventSafety>;
}

interface EvidenceBuildResult {
  evidenceIds: string[];
  evidenceItems: HandoffEvidenceItem[];
  exclusions: HandoffExclusionReason[];
}

interface HandoffPackScope {
  kind: HandoffKind;
  date?: string;
  project?: string;
}

export function buildHandoffPack(input: BuildHandoffPackInput): HandoffPack {
  const evidence = new Map<string, HandoffEvidenceItem>();
  const excluded: HandoffExclusion[] = [];
  const packScope: HandoffPackScope = {
    kind: input.kind
  };
  if (input.date) packScope.date = input.date;
  if (input.project) packScope.project = input.project;

  const recentActivity: HandoffActivityItem[] = [];
  for (const session of input.activitySessions) {
    const result = buildEvidenceIds({
      refs: session.evidence,
      eventIds: session.eventIds,
      eventSafety: input.eventSafety,
      objectType: "activity",
      objectId: session.id,
      packScope
    });
    if (!includeOrExclude(result, excluded, "activity", session.id)) continue;
    mergeEvidence(evidence, result);
    const activityItem: HandoffActivityItem = {
      id: session.id,
      title: session.title,
      startAt: session.startAt,
      endAt: session.endAt,
      apps: session.apps,
      sourceKinds: session.sourceKinds,
      evidenceIds: result.evidenceIds
    };
    if (session.summary) activityItem.summary = session.summary;
    if (session.project) activityItem.project = session.project;
    recentActivity.push(activityItem);
  }

  const confirmedKnowledge: HandoffKnowledgeItem[] = [];
  const decisions: HandoffDecisionItem[] = [];
  const blockersAndRisks: HandoffRiskItem[] = [];
  for (const artifact of input.knowledgeArtifacts) {
    const result = buildEvidenceIds({
      refs: artifact.evidence,
      eventSafety: input.eventSafety,
      objectType: "knowledge",
      objectId: artifact.id,
      packScope
    });
    if (artifact.status !== "confirmed") {
      excluded.push({ objectType: "knowledge", objectId: artifact.id, reason: "draft_knowledge" });
      continue;
    }
    if (!includeOrExclude(result, excluded, "knowledge", artifact.id)) continue;
    mergeEvidence(evidence, result);
    confirmedKnowledge.push({
      id: artifact.id,
      title: artifact.title,
      type: artifact.type,
      description: artifact.content.description,
      keyInsights: artifact.content.keyInsights,
      projects: artifact.metadata.projects,
      confidence: artifact.confidence,
      evidenceIds: result.evidenceIds
    });
    for (const [index, decision] of (artifact.content.decisions ?? []).entries()) {
      decisions.push({
        id: createStableId("handoff_decision", ["knowledge", artifact.id, index, decision]),
        title: decision,
        sourceObjectId: artifact.id,
        sourceObjectType: "knowledge",
        evidenceIds: result.evidenceIds
      });
    }
    for (const [index, blocker] of (artifact.content.blockers ?? []).entries()) {
      blockersAndRisks.push({
        id: createStableId("handoff_risk", ["knowledge", artifact.id, index, blocker]),
        title: blocker,
        sourceObjectId: artifact.id,
        sourceObjectType: "knowledge",
        evidenceIds: result.evidenceIds
      });
    }
  }

  const activeMemories: HandoffMemoryItem[] = [];
  for (const memory of input.memories) {
    const result = buildEvidenceIds({
      refs: memory.evidence,
      eventSafety: input.eventSafety,
      objectType: "memory",
      objectId: memory.id,
      packScope
    });
    if (memory.status !== "confirmed") {
      excluded.push({ objectType: "memory", objectId: memory.id, reason: "memory_not_confirmed" });
      continue;
    }
    if (!includeOrExclude(result, excluded, "memory", memory.id)) continue;
    mergeEvidence(evidence, result);
    activeMemories.push({
      id: memory.id,
      title: memory.title,
      kind: memory.kind,
      body: memory.body,
      scope: memory.scope,
      tags: memory.tags,
      confidence: memory.confidence,
      evidenceIds: result.evidenceIds
    });
    if (memory.kind === "decision") {
      decisions.push({
        id: createStableId("handoff_decision", ["memory", memory.id, memory.title]),
        title: memory.body,
        sourceObjectId: memory.id,
        sourceObjectType: "memory",
        evidenceIds: result.evidenceIds
      });
    }
  }

  const recommendedNextActions: HandoffRecommendationItem[] = [];
  for (const recommendation of input.recommendations) {
    const result = buildEvidenceIds({
      refs: recommendation.evidence,
      eventSafety: input.eventSafety,
      objectType: "recommendation",
      objectId: recommendation.id,
      packScope
    });
    if (recommendation.status === "dismissed" || recommendation.status === "resolved") {
      excluded.push({
        objectType: "recommendation",
        objectId: recommendation.id,
        reason: "recommendation_terminal"
      });
      continue;
    }
    if (!includeOrExclude(result, excluded, "recommendation", recommendation.id)) continue;
    mergeEvidence(evidence, result);
    const item: HandoffRecommendationItem = {
      id: recommendation.id,
      title: recommendation.title,
      type: recommendation.type,
      explanation: recommendation.explanation,
      suggestedAction: recommendation.suggestedAction,
      confidence: recommendation.confidence,
      impact: recommendation.impact,
      status: recommendation.status,
      evidenceIds: result.evidenceIds
    };
    recommendedNextActions.push(item);
    if (
      recommendation.type === "risk" ||
      recommendation.type === "blocker" ||
      recommendation.type === "context_needed"
    ) {
      blockersAndRisks.push({
        id: createStableId("handoff_risk", ["recommendation", recommendation.id]),
        title: recommendation.title,
        impact: recommendation.impact,
        suggestedAction: recommendation.suggestedAction,
        sourceObjectId: recommendation.id,
        sourceObjectType: "recommendation",
        evidenceIds: result.evidenceIds
      });
    }
  }

  const pack: HandoffPack = {
    schemaVersion: 1,
    id: createStableId("handoff", [
      input.kind,
      input.date,
      input.project,
      input.activitySessions.map((session) => session.id),
      input.knowledgeArtifacts.map((artifact) => artifact.id),
      input.memories.map((memory) => memory.id),
      input.recommendations.map((recommendation) => recommendation.id)
    ]),
    kind: input.kind,
    objective: input.objective,
    generatedAt: input.generatedAt,
    currentState: buildCurrentState(recentActivity, confirmedKnowledge, activeMemories),
    recentActivity,
    confirmedKnowledge,
    activeMemories,
    decisions,
    blockersAndRisks,
    recommendedNextActions,
    safetyBoundaries: buildSafetyBoundaries(),
    evidenceIndex: [...evidence.values()].sort((a, b) => a.id.localeCompare(b.id)),
    excluded
  };
  if (input.date) pack.date = input.date;
  if (input.project) pack.project = input.project;
  return pack;
}

function buildEvidenceIds(input: {
  refs: EvidenceRef[];
  eventIds?: string[];
  eventSafety: Map<string, HandoffEventSafety>;
  objectType: HandoffEvidenceItem["objectType"];
  objectId: string;
  packScope: HandoffPackScope;
}): EvidenceBuildResult {
  const exclusions = new Set<HandoffExclusionReason>();
  const evidenceIds: string[] = [];
  const evidenceItems: HandoffEvidenceItem[] = [];
  const refs = [...input.refs];
  for (const eventId of input.eventIds ?? []) {
    if (!refs.some((ref) => ref.eventId === eventId)) {
      const safety = input.eventSafety.get(eventId);
      refs.push({
        eventId,
        sourceKind: safety?.sourceKind ?? "filesystem",
        sourcePointer: safety?.sourcePointer ?? `event://${eventId}`,
        timestamp: safety?.timestamp ?? new Date(0).toISOString()
      });
    }
  }

  if (refs.length === 0) {
    exclusions.add("missing_evidence");
  }

  for (const ref of refs) {
    const safety = ref.eventId ? input.eventSafety.get(ref.eventId) : undefined;
    if (ref.eventId && !safety) {
      exclusions.add("missing_evidence");
      continue;
    }
    if (safety?.sensitivity === "secret") {
      exclusions.add("secret_content");
      continue;
    }
    if (safety?.redactionState === "failed") {
      exclusions.add("failed_redaction");
      continue;
    }
    if (safety && !safety.canExportToAgent) {
      exclusions.add("source_export_blocked");
      continue;
    }

    const evidenceId = createStableId("handoff_ev", [
      input.packScope.kind,
      input.packScope.date,
      input.packScope.project,
      input.objectType,
      input.objectId,
      ref.eventId,
      ref.sourcePointer
    ]);
    evidenceIds.push(evidenceId);
    evidenceItems.push({
      id: evidenceId,
      sourceKind: safety?.sourceKind ?? ref.sourceKind,
      sourcePointer: safety?.sourcePointer ?? ref.sourcePointer,
      timestamp: safety?.timestamp ?? ref.timestamp,
      objectType: input.objectType,
      objectId: input.objectId
    });
  }

  if (evidenceIds.length === 0 && exclusions.size === 0) {
    exclusions.add("missing_evidence");
  }

  return {
    evidenceIds,
    evidenceItems,
    exclusions: [...exclusions]
  };
}

function mergeEvidence(
  evidence: Map<string, HandoffEvidenceItem>,
  result: EvidenceBuildResult
): void {
  for (const item of result.evidenceItems) {
    if (!evidence.has(item.id)) {
      evidence.set(item.id, item);
    }
  }
}

function includeOrExclude(
  result: EvidenceBuildResult,
  excluded: HandoffExclusion[],
  objectType: HandoffExclusion["objectType"],
  objectId: string
): boolean {
  for (const reason of result.exclusions) {
    excluded.push({ objectType, objectId, reason });
  }
  return result.evidenceIds.length > 0;
}

function buildCurrentState(
  recentActivity: HandoffActivityItem[],
  confirmedKnowledge: HandoffKnowledgeItem[],
  activeMemories: HandoffMemoryItem[]
): string[] {
  return [
    `${recentActivity.length} recent activity session(s) are safe for handoff.`,
    `${confirmedKnowledge.length} confirmed knowledge artifact(s) are available.`,
    `${activeMemories.length} active memory item(s) are available.`
  ];
}

function buildSafetyBoundaries(): HandoffSafetyBoundary[] {
  return [
    {
      kind: "review_required",
      title: "User review required",
      description: "Review this handoff before sharing it with another agent."
    },
    {
      kind: "no_side_effects",
      title: "No side effects",
      description: "This pack suggests next actions but does not execute them."
    },
    {
      kind: "no_raw_payloads",
      title: "No raw payloads",
      description: "Raw Event text, screenshots, recordings, and transcripts are excluded."
    },
    {
      kind: "source_export_policy",
      title: "Source export policy applies",
      description: "Sources that disallow agent export are excluded."
    },
    {
      kind: "local_only",
      title: "Local only",
      description: "Generating this pack does not send content to external services."
    }
  ];
}
