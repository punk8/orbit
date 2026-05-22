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
  | "source_export_blocked"
  | "raw_payload_excluded"
  | "private_payload_excluded";

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
  completedOrAttempted: HandoffProgressItem[];
  recentActivity: HandoffActivityItem[];
  confirmedKnowledge: HandoffKnowledgeItem[];
  activeMemories: HandoffMemoryItem[];
  decisions: HandoffDecisionItem[];
  blockersAndRisks: HandoffRiskItem[];
  recommendedNextActions: HandoffRecommendationItem[];
  nextSteps: HandoffNextStepItem[];
  safetyBoundaries: HandoffSafetyBoundary[];
  evidenceIndex: HandoffEvidenceItem[];
  excluded: HandoffExclusion[];
}

export interface HandoffProgressItem {
  id: string;
  title: string;
  status: "completed" | "attempted";
  sourceObjectId: string;
  sourceObjectType: "activity" | "knowledge" | "recommendation";
  evidenceIds: string[];
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

export interface HandoffNextStepItem {
  id: string;
  title: string;
  action: string;
  confidence: number;
  impact: Recommendation["impact"];
  sourceObjectId: string;
  sourceObjectType: "knowledge" | "memory" | "recommendation";
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

export interface HandoffExclusionExplanation {
  title: string;
  description: string;
  nextAction: string;
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
  const completedOrAttempted: HandoffProgressItem[] = [];
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
    completedOrAttempted.push(...progressItemsFromActivity(activityItem));
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
  const nextSteps: HandoffNextStepItem[] = [];
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
    nextSteps.push({
      id: createStableId("handoff_next_step", ["recommendation", recommendation.id]),
      title: recommendation.title,
      action: recommendation.suggestedAction,
      confidence: recommendation.confidence,
      impact: recommendation.impact,
      sourceObjectId: recommendation.id,
      sourceObjectType: "recommendation",
      evidenceIds: result.evidenceIds
    });
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
    currentState: buildCurrentState({
      objective: input.objective,
      recentActivity,
      confirmedKnowledge,
      activeMemories,
      blockersAndRisks,
      recommendedNextActions,
      evidenceCount: evidence.size,
      exclusions: excluded.length
    }),
    completedOrAttempted: dedupeById(completedOrAttempted).slice(0, 8),
    recentActivity,
    confirmedKnowledge,
    activeMemories,
    decisions,
    blockersAndRisks,
    recommendedNextActions,
    nextSteps: dedupeById(nextSteps).slice(0, 8),
    safetyBoundaries: buildSafetyBoundaries(),
    evidenceIndex: [...evidence.values()].sort((a, b) => a.id.localeCompare(b.id)),
    excluded
  };
  if (input.date) pack.date = input.date;
  if (input.project) pack.project = input.project;
  return pack;
}

export function explainHandoffExclusion(
  reason: HandoffExclusionReason
): HandoffExclusionExplanation {
  if (reason === "draft_knowledge") {
    return {
      title: "Knowledge still needs review",
      description: "Draft or needs-review Knowledge is not treated as agent-ready context.",
      nextAction: "Review, edit if needed, then confirm the Knowledge Artifact."
    };
  }
  if (reason === "memory_not_confirmed") {
    return {
      title: "Memory is not confirmed",
      description: "Candidate, rejected, or archived Memory is excluded from default agent context.",
      nextAction: "Confirm the Memory candidate if it is durable and useful."
    };
  }
  if (reason === "recommendation_terminal") {
    return {
      title: "Recommendation is already closed",
      description: "Dismissed or resolved Recommendations are not suggested to the next agent.",
      nextAction: "Reopen or create a new Recommendation only if follow-up is still needed."
    };
  }
  if (reason === "missing_evidence") {
    return {
      title: "Evidence is missing",
      description: "Orbit could not attach a traceable source pointer for this object.",
      nextAction: "Rebuild the pipeline or inspect the source event before exporting it."
    };
  }
  if (reason === "secret_content") {
    return {
      title: "Secret content was detected",
      description: "Secret-classified evidence is blocked from Handoff by default.",
      nextAction: "Remove or redact the secret content, then regenerate derived context."
    };
  }
  if (reason === "failed_redaction") {
    return {
      title: "Redaction failed",
      description: "Evidence with failed redaction is excluded from persistence-sensitive exports.",
      nextAction: "Fix the source data or redaction result before allowing export."
    };
  }
  if (reason === "raw_payload_excluded") {
    return {
      title: "Raw payload was excluded",
      description:
        "Default Handoff keeps summaries and source pointers, not raw screenshots, OCR dumps, recordings, or transcripts.",
      nextAction: "Use an explicit export flow only after reviewing retention, redaction, and source policy."
    };
  }
  if (reason === "private_payload_excluded") {
    return {
      title: "Private payload was excluded",
      description:
        "Private-looking evidence snippets are stripped from the pack even when the source pointer itself is safe.",
      nextAction: "Review the Activity locally if the private detail is needed."
    };
  }
  return {
    title: "Source export is blocked",
    description: "The source policy does not allow this evidence to be exported to agents.",
    nextAction: "Enable agent export for that source after confirming the scope is safe."
  };
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
    if (ref.excerpt && hasRawPayloadMarker(ref.excerpt)) {
      exclusions.add("raw_payload_excluded");
    }
    if (ref.excerpt && hasPrivatePayloadMarker(ref.excerpt)) {
      exclusions.add("private_payload_excluded");
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

function buildCurrentState(input: {
  objective: string;
  recentActivity: HandoffActivityItem[];
  confirmedKnowledge: HandoffKnowledgeItem[];
  activeMemories: HandoffMemoryItem[];
  blockersAndRisks: HandoffRiskItem[];
  recommendedNextActions: HandoffRecommendationItem[];
  evidenceCount: number;
  exclusions: number;
}): string[] {
  return [
    `Current objective: ${input.objective}`,
    `Recent activity ready for agent handoff: ${input.recentActivity.length}`,
    `Confirmed knowledge ready for agent handoff: ${input.confirmedKnowledge.length}`,
    `Confirmed memories ready for agent handoff: ${input.activeMemories.length}`,
    `Open recommendations: ${input.recommendedNextActions.length}`,
    `Open blockers or risks: ${input.blockersAndRisks.length}`,
    `Traceable evidence pointers: ${input.evidenceCount}`,
    `Excluded items with reasons: ${input.exclusions}`
  ];
}

function progressItemsFromActivity(activity: HandoffActivityItem): HandoffProgressItem[] {
  const text = activity.summary ?? activity.title;
  const segments = text
    .split(/(?:\s*\/\s*)|(?:[。.!]\s*)/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const items: HandoffProgressItem[] = [];
  for (const [index, segment] of segments.entries()) {
    const status = progressStatus(segment);
    if (!status) continue;
    items.push({
      id: createStableId("handoff_progress", [activity.id, index, segment, status]),
      title: segment,
      status,
      sourceObjectId: activity.id,
      sourceObjectType: "activity",
      evidenceIds: activity.evidenceIds
    });
  }
  if (items.length > 0) return items;
  return [
    {
      id: createStableId("handoff_progress", [activity.id, activity.title, "completed"]),
      title: activity.summary ?? activity.title,
      status: "completed",
      sourceObjectId: activity.id,
      sourceObjectType: "activity",
      evidenceIds: activity.evidenceIds
    }
  ];
}

function progressStatus(value: string): HandoffProgressItem["status"] | undefined {
  if (/(已完成|完成|done|completed|shipped|verified|passed)/i.test(value)) return "completed";
  if (/(已尝试|尝试|下一步|next|attempted|tried|investigated|blocked)/i.test(value)) {
    return "attempted";
  }
  return undefined;
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

function hasRawPayloadMarker(value: string): boolean {
  return /RAW_|raw[-_\s]?(ocr|screen|frame|payload|dump|event|private)|screenshot|thumbnail/i.test(
    value
  );
}

function hasPrivatePayloadMarker(value: string): boolean {
  return /PRIVATE|secret token|hunter2|password|api[-_\s]?key|token/i.test(value);
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
