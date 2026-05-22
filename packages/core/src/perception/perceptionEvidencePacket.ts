import type { ActivitySession } from "../types/activity";
import type { Sensitivity, SourceKind } from "../types/common";
import type { Event } from "../types/event";
import { maxSensitivity } from "../sensitivity";

export interface PerceptionEvidencePacket {
  activitySessionId: string;
  timeWindow: {
    startAt: string;
    endAt: string;
  };
  apps: string[];
  project?: string;
  topic?: string;
  frameCount: number;
  nonDuplicateFrameCount: number;
  selectedOcrSnippets: string[];
  frameSummaries: string[];
  eventTimeline: PerceptionEvidenceTimelineItem[];
  sourcePointers: string[];
  evidenceHashes: string[];
  privacy: {
    sensitivity: Sensitivity;
    redactionStates: Array<Event["privacy"]["redactionState"]>;
    exportEligible: boolean;
  };
  blockedReasons: PerceptionEvidenceBlockedReason[];
}

export interface PerceptionEvidenceTimelineItem {
  eventId: string;
  sourceKind: SourceKind;
  timestamp: string;
  summary: string;
  sourcePointer: string;
}

export type PerceptionEvidenceBlockedReason =
  | "secret_content"
  | "failed_redaction"
  | "source_export_blocked"
  | "raw_payload_excluded"
  | "private_payload_excluded";

export function buildPerceptionEvidencePacket(input: {
  session: ActivitySession;
  events: Event[];
  maxSnippets?: number;
}): PerceptionEvidencePacket {
  const perceptionEvents = input.events
    .filter((event) => input.session.eventIds.includes(event.id))
    .filter((event) => isPerceptionSource(event.source.kind));
  const safeEvents = perceptionEvents.filter(isSafePerceptionEvent);
  const frameEvents = safeEvents.filter((event) => event.type === "screen_observation");
  const blockedReasons = blockedReasonsFor(input.session, perceptionEvents);
  const packet: PerceptionEvidencePacket = {
    activitySessionId: input.session.id,
    timeWindow: {
      startAt: input.session.startAt,
      endAt: input.session.endAt
    },
    apps: input.session.apps,
    frameCount: frameEvents.length,
    nonDuplicateFrameCount: countNonDuplicateFrames(frameEvents),
    selectedOcrSnippets: safeEvents
      .filter((event) => event.type === "ocr_text")
      .map((event) => safeSummary(event))
      .filter(isPresent)
      .slice(0, input.maxSnippets ?? 5),
    frameSummaries: frameEvents.map((event) => safeSummary(event)).filter(isPresent).slice(0, 8),
    eventTimeline: safeEvents
      .map((event) => ({
        eventId: event.id,
        sourceKind: event.source.kind,
        timestamp: event.occurredAt,
        summary: safeSummary(event) ?? event.type,
        sourcePointer: event.source.pointer
      }))
      .slice(0, 12),
    sourcePointers: unique(safeEvents.map((event) => event.source.pointer)),
    evidenceHashes: unique(safeEvents.map((event) => event.hash).filter(isPresent)),
    privacy: {
      sensitivity: maxSensitivity(perceptionEvents.map((event) => event.privacy.sensitivity)),
      redactionStates: unique(perceptionEvents.map((event) => event.privacy.redactionState)),
      exportEligible: blockedReasons.length === 0
    },
    blockedReasons
  };
  if (input.session.project) packet.project = input.session.project;
  if (input.session.topic) packet.topic = input.session.topic;
  return packet;
}

export function isPerceptionSource(sourceKind: SourceKind): boolean {
  return (
    sourceKind === "screen" ||
    sourceKind === "ocr" ||
    sourceKind === "audio" ||
    sourceKind === "transcript"
  );
}

function isSafePerceptionEvent(event: Event): boolean {
  return event.privacy.sensitivity !== "secret" && event.privacy.redactionState !== "failed";
}

function blockedReasonsFor(
  session: ActivitySession,
  events: Event[]
): PerceptionEvidenceBlockedReason[] {
  const reasons = new Set<PerceptionEvidenceBlockedReason>();
  for (const event of events) {
    if (event.privacy.sensitivity === "secret") reasons.add("secret_content");
    if (event.privacy.redactionState === "failed") reasons.add("failed_redaction");
    if (hasRawPayload(event)) reasons.add("raw_payload_excluded");
    if (hasPrivatePayload(event)) reasons.add("private_payload_excluded");
  }
  for (const policy of session.localState.sourcePolicies ?? []) {
    if (isPerceptionSource(policy.sourceKind) && !policy.canExportToAgent) {
      reasons.add("source_export_blocked");
    }
  }
  return [...reasons];
}

function safeSummary(event: Event): string | undefined {
  if (isPerceptionSource(event.source.kind)) {
    return event.content.summary ?? event.content.title;
  }
  return event.content.summary ?? event.content.title ?? event.content.text;
}

function countNonDuplicateFrames(events: Event[]): number {
  const hashes = events
    .map((event) => readString(event.content.metadata?.frameHash))
    .filter(isPresent);
  return hashes.length > 0 ? unique(hashes).length : events.length;
}

function hasRawPayload(event: Event): boolean {
  if (event.content.rawRef) return true;
  if (event.content.attachments?.some((attachment) => attachment.localRef)) return true;
  const metadata = event.content.metadata ?? {};
  return Boolean(
    metadata.rawFrameStored ||
      metadata.rawTextStored ||
      metadata.rawFrameRef ||
      metadata.rawTextRef ||
      metadata.rawRef
  );
}

function hasPrivatePayload(event: Event): boolean {
  const metadata = event.content.metadata ?? {};
  return Boolean(metadata.privatePayloadStored || metadata.privatePayloadRef);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function unique<T extends string>(values: T[]): T[] {
  return [...new Set(values)];
}

function isPresent<T>(value: T | undefined | null | ""): value is T {
  return value !== undefined && value !== null && value !== "";
}
