import {
  buildActivitySessions,
  createStableId,
  defaultPermissionScopeForSource,
  draftKnowledgeArtifact,
  extractMemoryCandidates,
  generateRecommendations
} from "@orbit/core";
import type { DraftKnowledgeOutput, AIProvider, EvidenceBackedText } from "@orbit/ai";
import type {
  ActivitySession,
  Event,
  EvidenceRef,
  FollowUp,
  KnowledgeArtifact,
  PermissionScope
} from "@orbit/core";
import type { OrbitDatabase } from "./connection";
import { ActivityRepository } from "./repositories/activityRepository";
import { AuditRepository } from "./repositories/auditRepository";
import { EventRepository } from "./repositories/eventRepository";
import { KnowledgeRepository } from "./repositories/knowledgeRepository";
import { MemoryRepository } from "./repositories/memoryRepository";
import { RecommendationRepository } from "./repositories/recommendationRepository";
import { SourceRepository } from "./repositories/sourceRepository";

export interface SemanticPipelineResult {
  events: number;
  activitySessions: {
    generated: number;
    total: number;
  };
  knowledgeArtifacts: {
    generated: number;
    total: number;
  };
  memories: {
    generated: number;
    total: number;
  };
  recommendations: {
    generated: number;
    total: number;
  };
}

export interface SemanticPipelineOptions {
  aiProvider?: AIProvider;
  language?: string;
}

export function runSemanticPipeline(
  database: OrbitDatabase,
  options: Pick<SemanticPipelineOptions, "language"> = {}
): SemanticPipelineResult {
  return runSemanticPipelineCore(database, options) as SemanticPipelineResult;
}

export async function runSemanticPipelineWithProvider(
  database: OrbitDatabase,
  options: SemanticPipelineOptions = {}
): Promise<SemanticPipelineResult> {
  return await Promise.resolve(runSemanticPipelineCore(database, options));
}

function runSemanticPipelineCore(
  database: OrbitDatabase,
  options: SemanticPipelineOptions = {}
): SemanticPipelineResult | Promise<SemanticPipelineResult> {
  const eventRepository = new EventRepository(database.db);
  const activityRepository = new ActivityRepository(database.db);
  const knowledgeRepository = new KnowledgeRepository(database.db);
  const memoryRepository = new MemoryRepository(database.db);
  const recommendationRepository = new RecommendationRepository(database.db);
  const auditRepository = new AuditRepository(database.db);
  const sourcePermissions = readSourcePermissions(new SourceRepository(database.db));

  const events = eventRepository.listEvents();
  const sessions = attachSourcePolicySnapshots(
    buildActivitySessions(events),
    events,
    sourcePermissions
  );
  const existingArtifacts = knowledgeRepository.listKnowledgeArtifacts();
  for (const session of sessions) {
    activityRepository.upsertActivitySession(session);
  }
  const preservedSessionIds = existingArtifacts.flatMap(
    (artifact) => artifact.metadata.sourceSessionIds
  );
  const prunedSessions = activityRepository.deleteActivitySessionsNotIn(
    sessions.map((session) => session.id),
    { preserveIds: preservedSessionIds }
  );
  if (prunedSessions > 0) {
    auditRepository.log("activity.reindex_prune", "activity_session", undefined, {
      deleted: prunedSessions,
      preservedReferencedSessions: preservedSessionIds.length
    });
  }

  const eventById = new Map(events.map((event) => [event.id, event]));
  const persistedSessions = activityRepository.listActivitySessions();
  const draftInputs = persistedSessions
    .map((session) => ({
      session,
      events: session.eventIds
        .map((eventId) => eventById.get(eventId))
        .filter((event) => event !== undefined)
    }))
    .filter((input) => shouldGenerateKnowledgeDraft(input.session, input.events));

  const buildArtifact = async (input: (typeof draftInputs)[number]): Promise<KnowledgeArtifact> => {
    const fallback = draftKnowledgeArtifact({ ...input, language: readKnowledgeLanguage(options) });
    if (!options.aiProvider?.enabled) return fallback;
    const eligibleEvents = filterEventsForAI(input.events, sourcePermissions);
    const filteredEventCount = input.events.length - eligibleEvents.length;
    if (eligibleEvents.length === 0) {
      auditRepository.log("ai.draft_knowledge.skipped", "activity_session", input.session.id, {
        provider: options.aiProvider.id,
        reason: "no_events_allowed_by_policy",
        sourceEventCount: input.events.length,
        filteredEventCount
      });
      return draftKnowledgeArtifact({
        ...input,
        language: readKnowledgeLanguage(options),
        generatedBy: "deterministic_privacy_fallback"
      });
    }
    try {
      const providerInput = {
        ...input,
        events: eligibleEvents,
        sourcePermissions
      };
      if (options.language !== undefined) {
        Object.assign(providerInput, { language: options.language });
      }
      const draft = await options.aiProvider.draftKnowledge(providerInput);
      auditRepository.log("ai.draft_knowledge", "activity_session", input.session.id, {
        provider: options.aiProvider.id,
        status: "success",
        includedEventIds: eligibleEvents.map((event) => event.id),
        filteredEventCount,
        payloadTextMode: eligibleEvents.some((event) => event.content.text) ? "excerpt" : "summary"
      });
      return knowledgeArtifactFromProviderDraft(fallback, draft, options.aiProvider.id);
    } catch (error) {
      auditRepository.log("ai.draft_knowledge", "activity_session", input.session.id, {
        provider: options.aiProvider.id,
        status: "failed",
        filteredEventCount,
        message: error instanceof Error ? error.message : String(error)
      });
      return draftKnowledgeArtifact({
        ...input,
        language: readKnowledgeLanguage(options),
        generatedBy: "deterministic_fallback"
      });
    }
  };

  if (options.aiProvider?.enabled) {
    return (async () => {
      const draftArtifacts: KnowledgeArtifact[] = [];
      for (const input of draftInputs) {
        const fallback = draftKnowledgeArtifact({ ...input, language: readKnowledgeLanguage(options) });
        const existing = knowledgeRepository.getKnowledgeArtifact(fallback.id);
        const artifact = existing ? fallback : await buildArtifact(input);
        draftArtifacts.push(artifact);
        if (!existing) {
          knowledgeRepository.upsertKnowledgeArtifact(artifact);
        }
      }
      return finishSemanticPipeline({
        events,
        sessions,
        draftArtifacts,
        activityRepository,
        knowledgeRepository,
        memoryRepository,
        recommendationRepository,
        persistedSessions
      });
    })();
  }

  const draftArtifacts = draftInputs.map((input) =>
    draftKnowledgeArtifact({ ...input, language: readKnowledgeLanguage(options) })
  );

  for (const artifact of draftArtifacts) {
    const existing = knowledgeRepository.getKnowledgeArtifact(artifact.id);
    if (!existing) {
      knowledgeRepository.upsertKnowledgeArtifact(artifact);
    }
  }

  return finishSemanticPipeline({
    events,
    sessions,
    draftArtifacts,
    activityRepository,
    knowledgeRepository,
    memoryRepository,
    recommendationRepository,
    persistedSessions
  });
}

function shouldGenerateKnowledgeDraft(
  session: ReturnType<ActivityRepository["listActivitySessions"]>[number],
  events: Event[]
): boolean {
  if (session.localState.closed === false) return false;
  if (session.localState.qualitySignals?.isLowQuality === true && isPerceptionSession(events)) {
    return false;
  }
  const lowSignalObservationOnly =
    events.length > 0 &&
    events.every(
      (event) =>
        event.source.kind === "desktop" &&
        [
          "app_focus",
          "window_focus",
          "window_title_change",
          "observation_state",
          "permission_state"
        ].includes(event.type)
    );
  if (!lowSignalObservationOnly) return true;
  const hasSemanticWindowEvidence = events.some(
    (event) =>
      (event.type === "window_focus" || event.type === "window_title_change") &&
      event.context.windowTitle &&
      event.privacy.redactionState === "none"
  );
  return session.durationSeconds >= 600 && hasSemanticWindowEvidence;
}

function readKnowledgeLanguage(options: SemanticPipelineOptions): "en" | "zh-CN" {
  return options.language === "zh-CN" ? "zh-CN" : "en";
}

function isPerceptionSession(events: Event[]): boolean {
  return events.some((event) =>
    ["screen", "ocr", "audio", "transcript"].includes(event.source.kind)
  );
}

function finishSemanticPipeline({
  events,
  sessions,
  draftArtifacts,
  activityRepository,
  knowledgeRepository,
  memoryRepository,
  recommendationRepository,
  persistedSessions
}: {
  events: ReturnType<EventRepository["listEvents"]>;
  sessions: ReturnType<typeof buildActivitySessions>;
  draftArtifacts: KnowledgeArtifact[];
  activityRepository: ActivityRepository;
  knowledgeRepository: KnowledgeRepository;
  memoryRepository: MemoryRepository;
  recommendationRepository: RecommendationRepository;
  persistedSessions: ReturnType<ActivityRepository["listActivitySessions"]>;
}): SemanticPipelineResult {
  const persistedArtifacts = knowledgeRepository.listKnowledgeArtifacts();
  const memoryCandidates = extractMemoryCandidates(persistedArtifacts);
  for (const memory of memoryCandidates) {
    const existing = memoryRepository.getMemory(memory.id);
    if (!existing) {
      memoryRepository.upsertMemory(memory);
    }
  }

  const persistedMemories = memoryRepository.listMemories();
  const recommendationCandidates = generateRecommendations({
    events,
    sessions: persistedSessions,
    artifacts: persistedArtifacts,
    memories: persistedMemories
  });
  for (const recommendation of recommendationCandidates) {
    const existing = recommendationRepository.getRecommendation(recommendation.id);
    if (!existing) {
      recommendationRepository.upsertRecommendation(recommendation);
    }
  }

  return {
    events: events.length,
    activitySessions: {
      generated: sessions.length,
      total: activityRepository.countActivitySessions()
    },
    knowledgeArtifacts: {
      generated: draftArtifacts.length,
      total: knowledgeRepository.countKnowledgeArtifacts()
    },
    memories: {
      generated: memoryCandidates.length,
      total: memoryRepository.countMemories()
    },
    recommendations: {
      generated: recommendationCandidates.length,
      total: recommendationRepository.countRecommendations()
    }
  };
}

function readSourcePermissions(
  sourceRepository: SourceRepository
): Record<string, PermissionScope> {
  return Object.fromEntries(
    sourceRepository
      .listSources()
      .map((source) => [
        source.id,
        source.permissionScope ??
          defaultPermissionScopeForSource(source.kind, source.defaultSensitivity)
      ])
  );
}

function attachSourcePolicySnapshots(
  sessions: ActivitySession[],
  events: Event[],
  sourcePermissions: Record<string, PermissionScope>
): ActivitySession[] {
  const eventsById = new Map(events.map((event) => [event.id, event]));
  return sessions.map((session) => {
    const sourcePolicies = dedupeSourcePolicies(
      session.eventIds
        .map((eventId) => eventsById.get(eventId))
        .filter((event) => event !== undefined)
        .map((event) => {
          const permission = sourcePermissions[event.source.adapterId];
          if (!permission) return undefined;
          return {
            sourceAdapterId: event.source.adapterId,
            sourceKind: event.source.kind,
            canStoreRaw: permission.canStoreRaw,
            canStoreSummary: permission.canStoreSummary,
            canUseForAI: permission.canUseForAI,
            canExportToAgent: permission.canExportToAgent,
            retentionPolicyId: permission.retentionPolicyId
          };
        })
        .filter((item) => item !== undefined)
    );
    if (sourcePolicies.length === 0) return session;
    return {
      ...session,
      localState: {
        ...session.localState,
        sourcePolicies
      }
    };
  });
}

function dedupeSourcePolicies(
  policies: NonNullable<ActivitySession["localState"]["sourcePolicies"]>
): NonNullable<ActivitySession["localState"]["sourcePolicies"]> {
  const seen = new Set<string>();
  const result: NonNullable<ActivitySession["localState"]["sourcePolicies"]> = [];
  for (const policy of policies) {
    const key = `${policy.sourceAdapterId}:${policy.sourceKind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(policy);
  }
  return result;
}

function filterEventsForAI(
  events: Event[],
  sourcePermissions: Record<string, PermissionScope>
): Event[] {
  return events.filter((event) => {
    if (event.privacy.sensitivity === "secret") return false;
    if (event.privacy.redactionState === "failed") return false;
    const permissionScope = sourcePermissions[event.source.adapterId];
    if (!permissionScope) return false;
    if (permissionScope.sourceKind !== event.source.kind) return false;
    if (!permissionScope.canUseForAI) return false;
    if (event.privacy.sensitivity === "confidential") return permissionScope.canUseForAI;
    return true;
  });
}

function knowledgeArtifactFromProviderDraft(
  fallback: KnowledgeArtifact,
  draft: DraftKnowledgeOutput,
  generatedBy: string
): KnowledgeArtifact {
  const keyInsightItems = evidenceBackedTextItems(fallback, draft.keyInsights);
  const decisionItems = evidenceBackedTextItems(fallback, draft.decisions);
  const blockerItems = evidenceBackedTextItems(fallback, draft.blockers);
  const followUps = evidenceBackedFollowUps(fallback, draft.followUps);
  const keyInsights =
    keyInsightItems.length > 0
      ? keyInsightItems.map((item) => item.text)
      : fallback.content.keyInsights;
  const decisions = decisionItems.map((item) => item.text);
  const blockers = blockerItems.map((item) => item.text);
  const content: KnowledgeArtifact["content"] = {
    description: draft.description,
    keyInsights,
    markdown: buildProviderMarkdown({
      title: draft.title,
      fallback,
      description: draft.description,
      keyInsights,
      decisions,
      blockers,
      followUps
    })
  };
  if (decisions.length > 0) content.decisions = decisions;
  if (blockers.length > 0) content.blockers = blockers;
  if (followUps.length > 0) content.followUps = followUps;

  return {
    ...fallback,
    title: draft.title,
    metadata: {
      ...fallback.metadata,
      generatedBy
    },
    content,
    evidence: usedEvidenceOrFallback(fallback, [
      ...keyInsightItems,
      ...decisionItems,
      ...blockerItems,
      ...followUps.map((item) => ({ evidence: item.evidence }))
    ]),
    confidence: clampConfidence(draft.confidence),
    updatedAt: new Date().toISOString()
  };
}

function evidenceBackedTextItems(
  fallback: KnowledgeArtifact,
  items: EvidenceBackedText[]
): Array<{ text: string; evidence: EvidenceRef[] }> {
  return items
    .map((item) => ({
      text: item.text.trim(),
      evidence: evidenceForIds(fallback, item.evidenceIds)
    }))
    .filter((item) => item.text.length > 0 && item.evidence.length > 0);
}

function evidenceBackedFollowUps(
  fallback: KnowledgeArtifact,
  items: DraftKnowledgeOutput["followUps"]
): FollowUp[] {
  return items
    .map((item) => {
      const title = item.title.trim();
      const evidence = evidenceForIds(fallback, item.evidenceIds);
      if (!title || evidence.length === 0) return undefined;
      const followUp: FollowUp = {
        id: createStableId("followup", {
          knowledgeId: fallback.id,
          title,
          evidenceIds: item.evidenceIds
        }),
        title,
        status: "open" as const,
        evidence
      };
      return followUp;
    })
    .filter((item): item is FollowUp => item !== undefined);
}

function evidenceForIds(fallback: KnowledgeArtifact, evidenceIds: string[]): EvidenceRef[] {
  const refs: EvidenceRef[] = [];
  for (const id of [...new Set(evidenceIds)]) {
    if (id === fallback.metadata.sourceSessionIds[0]) {
      refs.push(...fallback.evidence);
      continue;
    }
    refs.push(...fallback.evidence.filter((ref) => ref.eventId === id));
  }
  return dedupeEvidence(refs);
}

function usedEvidenceOrFallback(
  fallback: KnowledgeArtifact,
  items: Array<{ evidence: EvidenceRef[] }>
): EvidenceRef[] {
  const refs = dedupeEvidence(items.flatMap((item) => item.evidence));
  return refs.length > 0 ? refs : fallback.evidence;
}

function dedupeEvidence(refs: EvidenceRef[]): EvidenceRef[] {
  const seen = new Set<string>();
  const result: EvidenceRef[] = [];
  for (const ref of refs) {
    const key = `${ref.eventId ?? ""}:${ref.activitySessionId ?? ""}:${ref.sourcePointer}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(ref);
  }
  return result;
}

function buildProviderMarkdown({
  title,
  fallback,
  description,
  keyInsights,
  decisions,
  blockers,
  followUps
}: {
  title: string;
  fallback: KnowledgeArtifact;
  description: string;
  keyInsights: string[];
  decisions: string[];
  blockers: string[];
  followUps: FollowUp[];
}): string {
  return [
    `# ${title}`,
    "",
    `Time: ${fallback.metadata.timeWindow?.startAt ?? "unknown"} - ${fallback.metadata.timeWindow?.endAt ?? "unknown"}`,
    `Project: ${fallback.metadata.projects[0] ?? "unknown"}`,
    "",
    "## Description",
    description,
    "",
    "## Key Insights",
    ...listOrNone(keyInsights),
    "",
    "## Decisions",
    ...listOrNone(decisions),
    "",
    "## Blockers",
    ...listOrNone(blockers),
    "",
    "## Follow Ups",
    ...listOrNone(followUps.map((item) => item.title))
  ].join("\n");
}

function listOrNone(items: string[]): string[] {
  return items.length > 0 ? items.map((item) => `- ${item}`) : ["- None"];
}

function clampConfidence(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5;
}
