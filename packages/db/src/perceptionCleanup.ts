import { appendFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type {
  Event,
  EvidenceRef,
  KnowledgeArtifact,
  Memory,
  PerceptionControlPlaneStatus,
  PerceptionSourceKind,
  Recommendation
} from "@orbit/core";
import type { OrbitDatabase } from "./connection";
import { AuditRepository } from "./repositories/auditRepository";
import { EventRepository } from "./repositories/eventRepository";
import { KnowledgeRepository } from "./repositories/knowledgeRepository";
import { MemoryRepository } from "./repositories/memoryRepository";
import { RecommendationRepository } from "./repositories/recommendationRepository";
import { SourceRepository } from "./repositories/sourceRepository";
import { readPerceptionStatus } from "./perceptionSettings";
import { runSemanticPipeline, type SemanticPipelineResult } from "./semanticPipeline";

export interface PerceptionSidecarCleanupOptions {
  now?: Date | string;
  dryRun?: boolean;
  sourceKind?: PerceptionSourceKind;
}

export interface PerceptionSidecarCleanupResult {
  scannedEvents: number;
  perceptionEvents: number;
  eventsWithRawSidecars: number;
  cleanedEvents: number;
  removedRawRefs: number;
  removedAttachments: number;
  deletedLocalSidecars: number;
  retainedRawSidecars: number;
  preservedSummaries: number;
  ledgerPath?: string;
  ledgerEntries: PerceptionSidecarCleanupLedgerEntry[];
  warnings: string[];
  dryRun: boolean;
}

export interface PerceptionSidecarCleanupLedgerEntry {
  eventId: string;
  sourceKind: string;
  sourcePointer: string;
  reason: string;
  occurredAt: string;
  removedRawRefs: number;
  removedAttachments: number;
  deletedLocalSidecars: number;
  dryRun: boolean;
}

export interface DeletePerceptionSourceEventsOptions {
  sourceKind?: PerceptionSourceKind;
  sourceAdapterId?: string;
  from?: string;
  to?: string;
  dryRun?: boolean;
}

export interface DeletePerceptionSourceEventsResult {
  dryRun: boolean;
  sourceKind?: PerceptionSourceKind;
  sourceAdapterId?: string;
  from?: string;
  to?: string;
  scannedEvents: number;
  matchedEvents: number;
  deletedEvents: number;
  preservedKnowledge: number;
  preservedMemories: number;
  preservedRecommendations: number;
  preservedEvidenceRefs: number;
  rebuild: {
    status: "not_required" | "completed";
    pipeline?: SemanticPipelineResult;
  };
}

export function cleanupPerceptionSidecars(
  database: OrbitDatabase,
  options: PerceptionSidecarCleanupOptions = {}
): PerceptionSidecarCleanupResult {
  const now = normalizeNow(options.now);
  const dryRun = options.dryRun === true;
  const events = new EventRepository(database.db);
  const sources = new SourceRepository(database.db);
  const audit = new AuditRepository(database.db);
  const perceptionStatus = readPerceptionStatus(database.db);
  const sourceRecords = new Map(sources.listSources().map((source) => [source.id, source]));
  const warnings: string[] = [];
  let scannedEvents = 0;
  let perceptionEvents = 0;
  let eventsWithRawSidecars = 0;
  let cleanedEvents = 0;
  let removedRawRefs = 0;
  let removedAttachments = 0;
  let deletedLocalSidecars = 0;
  let retainedRawSidecars = 0;
  let preservedSummaries = 0;
  const ledgerPath = join(database.orbitHome, "perception", "cleanup-ledger.jsonl");
  const ledgerEntries: PerceptionSidecarCleanupLedgerEntry[] = [];

  for (const event of events.listEvents()) {
    scannedEvents += 1;
    const sourceKind = perceptionSourceKindForEvent(event);
    if (!sourceKind || (options.sourceKind && options.sourceKind !== sourceKind)) continue;
    perceptionEvents += 1;
    if (!hasRawSidecar(event)) continue;
    eventsWithRawSidecars += 1;

    const policy = perceptionPolicyForSource(perceptionStatus, sourceKind);
    const sourceRecord = sourceRecords.get(event.source.adapterId);
    const cleanupReason = rawCleanupReason(event, policy, sourceRecord?.enabled ?? false, now);
    if (!cleanupReason) {
      retainedRawSidecars += 1;
      continue;
    }

    const minimized = removeRawSidecar(event);
    const eventRemovedRawRefs = event.content.rawRef ? 1 : 0;
    const eventRemovedAttachments = event.content.attachments?.length ?? 0;
    let eventDeletedLocalSidecars = 0;
    removedRawRefs += eventRemovedRawRefs;
    removedAttachments += eventRemovedAttachments;
    if (!event.content.summary && minimized.content.summary) preservedSummaries += 1;

    for (const localRef of rawLocalRefs(event)) {
      const deletion = deleteLocalSidecar(database.orbitHome, localRef, dryRun);
      deletedLocalSidecars += deletion.deleted ? 1 : 0;
      eventDeletedLocalSidecars += deletion.deleted ? 1 : 0;
      if (deletion.warning) warnings.push(deletion.warning);
    }
    ledgerEntries.push({
      eventId: event.id,
      sourceKind,
      sourcePointer: event.source.pointer,
      reason: cleanupReason,
      occurredAt: event.occurredAt,
      removedRawRefs: eventRemovedRawRefs,
      removedAttachments: eventRemovedAttachments,
      deletedLocalSidecars: eventDeletedLocalSidecars,
      dryRun
    });

    if (!dryRun) {
      events.updateEventPrivacyAndContent(minimized);
    }
    cleanedEvents += 1;
  }

  const result: PerceptionSidecarCleanupResult = {
    scannedEvents,
    perceptionEvents,
    eventsWithRawSidecars,
    cleanedEvents,
    removedRawRefs,
    removedAttachments,
    deletedLocalSidecars,
    retainedRawSidecars,
    preservedSummaries,
    ledgerPath,
    ledgerEntries,
    warnings,
    dryRun
  };

  writeCleanupLedger(ledgerPath, ledgerEntries);
  audit.log("perception.sidecar_cleanup", "database", undefined, result);

  if (!dryRun && cleanedEvents > 0) {
    runSemanticPipeline(database);
  }

  return result;
}

export function deletePerceptionSourceEvents(
  database: OrbitDatabase,
  options: DeletePerceptionSourceEventsOptions = {}
): DeletePerceptionSourceEventsResult {
  const eventRepository = new EventRepository(database.db);
  const knowledgeRepository = new KnowledgeRepository(database.db);
  const memoryRepository = new MemoryRepository(database.db);
  const recommendationRepository = new RecommendationRepository(database.db);
  const auditRepository = new AuditRepository(database.db);
  const dryRun = options.dryRun === true;
  const events = eventRepository.listEvents();
  const matchedEvents = events.filter((event) => eventMatchesDeleteOptions(event, options));
  const matchedEventIds = new Set(matchedEvents.map((event) => event.id));
  const affected = findAndMarkUnavailableEvidence({
    knowledgeRepository,
    memoryRepository,
    recommendationRepository,
    matchedEventIds,
    dryRun
  });

  let deletedEvents = 0;
  if (!dryRun && matchedEvents.length > 0) {
    deletedEvents = eventRepository.deleteEventsByIds([...matchedEventIds]);
  }
  const pipeline =
    !dryRun && (deletedEvents > 0 || affected.preservedEvidenceRefs > 0)
      ? runSemanticPipeline(database)
      : undefined;
  const result: DeletePerceptionSourceEventsResult = {
    dryRun,
    ...(options.sourceKind ? { sourceKind: options.sourceKind } : {}),
    ...(options.sourceAdapterId ? { sourceAdapterId: options.sourceAdapterId } : {}),
    ...(options.from ? { from: options.from } : {}),
    ...(options.to ? { to: options.to } : {}),
    scannedEvents: events.length,
    matchedEvents: matchedEvents.length,
    deletedEvents,
    preservedKnowledge: affected.preservedKnowledge,
    preservedMemories: affected.preservedMemories,
    preservedRecommendations: affected.preservedRecommendations,
    preservedEvidenceRefs: affected.preservedEvidenceRefs,
    rebuild: pipeline ? { status: "completed", pipeline } : { status: "not_required" }
  };

  auditRepository.log("perception.events_delete", "database", undefined, result);
  if (affected.preservedEvidenceRefs > 0) {
    auditRepository.log("perception.evidence_unavailable", "database", undefined, {
      reason: "source_events_deleted",
      preservedKnowledge: affected.preservedKnowledge,
      preservedMemories: affected.preservedMemories,
      preservedRecommendations: affected.preservedRecommendations,
      preservedEvidenceRefs: affected.preservedEvidenceRefs,
      dryRun
    });
  }

  return result;
}

function eventMatchesDeleteOptions(
  event: Event,
  options: DeletePerceptionSourceEventsOptions
): boolean {
  const sourceKind = perceptionSourceKindForEvent(event);
  if (!sourceKind) return false;
  if (options.sourceKind && sourceKind !== options.sourceKind) return false;
  if (options.sourceAdapterId && event.source.adapterId !== options.sourceAdapterId) return false;
  if (options.from && new Date(event.occurredAt).getTime() < new Date(options.from).getTime()) {
    return false;
  }
  if (options.to && new Date(event.occurredAt).getTime() > new Date(options.to).getTime()) {
    return false;
  }
  return true;
}

function findAndMarkUnavailableEvidence(input: {
  knowledgeRepository: KnowledgeRepository;
  memoryRepository: MemoryRepository;
  recommendationRepository: RecommendationRepository;
  matchedEventIds: Set<string>;
  dryRun: boolean;
}): {
  preservedKnowledge: number;
  preservedMemories: number;
  preservedRecommendations: number;
  preservedEvidenceRefs: number;
} {
  let preservedKnowledge = 0;
  let preservedMemories = 0;
  let preservedRecommendations = 0;
  let preservedEvidenceRefs = 0;

  for (const artifact of input.knowledgeRepository.listKnowledgeArtifacts()) {
    const marked = markEvidenceRefsUnavailable(artifact.evidence, input.matchedEventIds);
    if (marked.changedRefs === 0) continue;
    preservedKnowledge += 1;
    preservedEvidenceRefs += marked.changedRefs;
    if (!input.dryRun) {
      const updated: KnowledgeArtifact = {
        ...artifact,
        metadata: {
          ...artifact.metadata,
          evidenceState: artifact.evidence.length === marked.changedRefs ? "unavailable" : "partial",
          evidenceUnavailableReason: "source_events_deleted"
        },
        evidence: marked.evidence,
        updatedAt: new Date().toISOString()
      };
      input.knowledgeRepository.upsertKnowledgeArtifact(updated);
    }
  }

  for (const memory of input.memoryRepository.listMemories()) {
    const marked = markEvidenceRefsUnavailable(memory.evidence, input.matchedEventIds);
    if (marked.changedRefs === 0) continue;
    preservedMemories += 1;
    preservedEvidenceRefs += marked.changedRefs;
    if (!input.dryRun) {
      const updated: Memory = {
        ...memory,
        tags: Array.from(new Set([...memory.tags, "evidence_unavailable"])),
        evidence: marked.evidence,
        updatedAt: new Date().toISOString()
      };
      input.memoryRepository.upsertMemory(updated);
    }
  }

  for (const recommendation of input.recommendationRepository.listRecommendations()) {
    const marked = markEvidenceRefsUnavailable(recommendation.evidence, input.matchedEventIds);
    if (marked.changedRefs === 0) continue;
    preservedRecommendations += 1;
    preservedEvidenceRefs += marked.changedRefs;
    if (!input.dryRun) {
      const updated: Recommendation = {
        ...recommendation,
        evidence: marked.evidence
      };
      input.recommendationRepository.upsertRecommendation(updated);
    }
  }

  return {
    preservedKnowledge,
    preservedMemories,
    preservedRecommendations,
    preservedEvidenceRefs
  };
}

function markEvidenceRefsUnavailable(
  evidence: EvidenceRef[],
  eventIds: Set<string>
): { evidence: EvidenceRef[]; changedRefs: number } {
  let changedRefs = 0;
  const marked = evidence.map((ref) => {
    if (!ref.eventId || !eventIds.has(ref.eventId)) return ref;
    changedRefs += 1;
    const next: EvidenceRef = {
      ...ref,
      availability: "unavailable",
      unavailableReason: "source_events_deleted"
    };
    delete next.eventId;
    delete next.excerpt;
    return next;
  });
  return { evidence: marked, changedRefs };
}

function writeCleanupLedger(
  ledgerPath: string,
  entries: PerceptionSidecarCleanupLedgerEntry[]
): void {
  mkdirSync(dirname(ledgerPath), { recursive: true });
  if (entries.length === 0) {
    appendFileSync(ledgerPath, "");
    return;
  }
  appendFileSync(ledgerPath, entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
}

function normalizeNow(value: Date | string | undefined): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string") return new Date(value);
  return new Date();
}

function perceptionSourceKindForEvent(event: Event): PerceptionSourceKind | undefined {
  if (event.source.adapterId === "perception_vision") return "vision";
  if (event.source.adapterId === "perception_audio") return "microphone_audio";
  if (event.source.adapterId === "perception_transcript") return "transcript";
  if (event.source.kind === "screen") return "screen";
  if (event.source.kind === "ocr") return "ocr";
  if (event.source.kind === "audio") return "microphone_audio";
  if (event.source.kind === "transcript") return "transcript";
  return undefined;
}

function perceptionPolicyForSource(
  status: PerceptionControlPlaneStatus,
  sourceKind: PerceptionSourceKind
): PerceptionControlPlaneStatus["sources"][number] {
  const source = status.sources.find((item) => item.sourceKind === sourceKind);
  if (!source) throw new Error(`Unknown perception source: ${sourceKind}`);
  return source;
}

function hasRawSidecar(event: Event): boolean {
  return Boolean(event.content.rawRef || event.content.attachments?.some((item) => item.localRef));
}

function rawCleanupReason(
  event: Event,
  source: PerceptionControlPlaneStatus["sources"][number],
  sourceEnabled: boolean,
  now: Date
): string | undefined {
  if (event.privacy.redactionState === "failed") return "failed_redaction";
  if (!source.policy.canStoreRaw) return "raw_storage_disabled";
  if (source.policy.deleteRawOnDisable && !sourceEnabled) return "source_disabled";
  const ttl = source.policy.rawRetentionTtlMinutes;
  if (!ttl) return "raw_ttl_missing";
  const ageMs = now.getTime() - new Date(event.occurredAt).getTime();
  if (ageMs >= ttl * 60_000) return "raw_ttl_expired";
  return undefined;
}

function removeRawSidecar(event: Event): Event {
  const content: Event["content"] = { ...event.content };
  if (!content.summary && content.text) {
    content.summary = truncate(content.text, 240);
  }
  const metadata = content.metadata ? { ...content.metadata } : {};
  metadata.rawFrameStored = false;
  metadata.rawFrameState =
    event.privacy.redactionState === "failed"
      ? "blocked_protected"
      : event.content.metadata?.rawFrameState === "source_disabled"
        ? "source_disabled"
        : "deleted";
  metadata.cleanupState =
    event.privacy.redactionState === "failed"
      ? "blocked"
      : event.content.metadata?.cleanupState === "source_disabled"
        ? "source_disabled"
        : "deleted";
  delete metadata.rawFrameLocalRef;
  content.metadata = metadata;
  delete content.rawRef;
  delete content.attachments;
  return {
    ...event,
    content,
    privacy: {
      ...event.privacy,
      redactionState: event.privacy.redactionState === "failed" ? "failed" : "redacted"
    }
  };
}

function rawLocalRefs(event: Event): string[] {
  const refs = new Set<string>();
  if (event.content.rawRef) refs.add(event.content.rawRef);
  for (const attachment of event.content.attachments ?? []) {
    if (attachment.localRef) refs.add(attachment.localRef);
  }
  return [...refs];
}

function deleteLocalSidecar(
  orbitHome: string,
  localRef: string,
  dryRun: boolean
): { deleted: boolean; warning?: string } {
  if (localRef.startsWith("sidecar://")) return { deleted: false };
  if (!isAbsolute(localRef)) return { deleted: false };
  const resolvedHome = resolve(orbitHome);
  const resolvedRef = resolve(localRef);
  if (resolvedRef !== resolvedHome && !resolvedRef.startsWith(`${resolvedHome}/`)) {
    return {
      deleted: false,
      warning: `Skipped sidecar outside ORBIT_HOME: ${localRef}`
    };
  }
  if (dryRun || !existsSync(resolvedRef)) return { deleted: false };
  unlinkSync(resolvedRef);
  return { deleted: true };
}

function truncate(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
}
