import { existsSync, unlinkSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type { Event, PerceptionControlPlaneStatus, PerceptionSourceKind } from "@orbit/core";
import type { OrbitDatabase } from "./connection";
import { AuditRepository } from "./repositories/auditRepository";
import { EventRepository } from "./repositories/eventRepository";
import { SourceRepository } from "./repositories/sourceRepository";
import { readPerceptionStatus } from "./perceptionSettings";
import { runSemanticPipeline } from "./semanticPipeline";

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
  warnings: string[];
  dryRun: boolean;
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
    removedRawRefs += event.content.rawRef ? 1 : 0;
    removedAttachments += event.content.attachments?.length ?? 0;
    if (!event.content.summary && minimized.content.summary) preservedSummaries += 1;

    for (const localRef of rawLocalRefs(event)) {
      const deletion = deleteLocalSidecar(database.orbitHome, localRef, dryRun);
      deletedLocalSidecars += deletion.deleted ? 1 : 0;
      if (deletion.warning) warnings.push(deletion.warning);
    }

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
    warnings,
    dryRun
  };

  audit.log("perception.sidecar_cleanup", "database", undefined, result);

  if (!dryRun && cleanedEvents > 0) {
    runSemanticPipeline(database);
  }

  return result;
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
