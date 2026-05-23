import type { ActivitySession, Event } from "@orbit/core";
import { ActivityRepository, EventRepository, openOrbitDatabase } from "@orbit/db";
import { existsSync } from "node:fs";
import { getCliConfig } from "../config";

export type ActivityFrameRawState =
  | "available"
  | "expired"
  | "deleted"
  | "blocked_protected"
  | "source_disabled"
  | "not_stored";

export interface ActivityFrameLinkedEvent {
  id: string;
  type: Event["type"];
  sourcePointer: string;
  occurredAt: string;
  summary?: string;
}

export interface ActivityPlaybackFrame {
  frameId: string;
  frameIndex: number;
  timestamp: string;
  sourcePointer: string;
  app?: string;
  windowTitle?: string;
  summary: string;
  localRef?: string;
  rawAvailable: boolean;
  rawState: ActivityFrameRawState;
  retention?: {
    policyId?: string;
    expiresAt?: string;
    cleanupState?: string;
    protectionStatus?: string;
  };
  redactionState: Event["privacy"]["redactionState"];
  ocrStatus: "pending" | "completed" | "skipped" | "failed";
  linkedEvents: ActivityFrameLinkedEvent[];
}

export interface ActivityFramesResult {
  activityId: string;
  frameCount: number;
  eventCount: number;
  frames: ActivityPlaybackFrame[];
}

export interface ActivityPlaybackResult extends ActivityFramesResult {
  scrubber: {
    markers: Array<{
      frameId: string;
      position: number;
      timestamp: string;
      rawState: ActivityFrameRawState;
    }>;
  };
  eventStream: ActivityFrameLinkedEvent[];
}

export function getActivityFrames(activityId: string): ActivityFramesResult {
  return withActivityPlayback(activityId, ({ session, events }) => {
    const frames = buildActivityFrames(session, events);
    return {
      activityId: session.id,
      frameCount: frames.length,
      eventCount: session.eventCount,
      frames
    };
  });
}

export function getActivityPlayback(activityId: string): ActivityPlaybackResult {
  return withActivityPlayback(activityId, ({ session, events }) => {
    const frames = buildActivityFrames(session, events);
    return {
      activityId: session.id,
      frameCount: frames.length,
      eventCount: session.eventCount,
      frames,
      scrubber: {
        markers: buildScrubberMarkers(session, frames)
      },
      eventStream: events.map(linkedEvent)
    };
  });
}

function withActivityPlayback<T>(
  activityId: string,
  read: (input: { session: ActivitySession; events: Event[] }) => T
): T {
  const config = getCliConfig();
  const database = openOrbitDatabase({ orbitHome: config.orbitHome });
  try {
    const activityRepository = new ActivityRepository(database.db);
    const eventRepository = new EventRepository(database.db);
    const session = activityRepository.getActivitySession(activityId);
    if (!session) throw new Error(`Unknown activity session: ${activityId}`);
    return read({
      session,
      events: eventRepository.listEventsByIds(session.eventIds)
    });
  } finally {
    database.close();
  }
}

function buildActivityFrames(session: ActivitySession, events: Event[]): ActivityPlaybackFrame[] {
  const eventsByFrameHash = groupEventsByFrameHash(events);
  const screenEvents = events.filter((event) => event.type === "screen_observation");
  return screenEvents.map((event, index) => {
    const metadata = event.content.metadata ?? {};
    const frameHash = readString(metadata.frameHash) ?? event.source.pointer;
    const linkedEvents = sortLinkedFrameEvents(eventsByFrameHash.get(frameHash) ?? [event]);
    const rawState = frameRawState(event);
    const rawAvailable = rawState === "available";
    const localRef = readString(metadata.rawFrameLocalRef) ?? event.content.rawRef;
    const retention = frameRetention(metadata);
    return {
      frameId: frameHash,
      frameIndex: index,
      timestamp: event.occurredAt,
      sourcePointer: event.source.pointer,
      ...(event.context.app ? { app: event.context.app } : {}),
      ...(event.context.windowTitle ? { windowTitle: event.context.windowTitle } : {}),
      summary: event.content.summary ?? event.content.title ?? event.source.pointer,
      ...(localRef ? { localRef } : {}),
      rawAvailable,
      rawState,
      ...(retention ? { retention } : {}),
      redactionState: event.privacy.redactionState,
      ocrStatus: linkedEvents.some((item) => item.type === "ocr_text") ? "completed" : "pending",
      linkedEvents: linkedEvents.map(linkedEvent)
    };
  });
}

function frameRawState(event: Event): ActivityFrameRawState {
  const metadata = event.content.metadata ?? {};
  const state = readString(metadata.rawFrameState);
  if (state === "blocked_protected" || state === "source_disabled" || state === "deleted") {
    return state;
  }
  if (state === "expired") return "expired";
  const protectionStatus = readString(metadata.protectionStatus);
  if (protectionStatus === "blocked_protected") return "blocked_protected";
  const localRef = readString(metadata.rawFrameLocalRef) ?? event.content.rawRef;
  if (!localRef) {
    const cleanupState = readString(metadata.cleanupState);
    if (cleanupState === "deleted") return "deleted";
    if (cleanupState === "source_disabled") return "source_disabled";
    return "not_stored";
  }
  const expiresAt = readString(metadata.rawFrameExpiresAt);
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) return "expired";
  if (!existsSync(localRef)) return "deleted";
  return "available";
}

function frameRetention(metadata: Record<string, unknown>):
  | ActivityPlaybackFrame["retention"]
  | undefined {
  const policyId = readString(metadata.retentionPolicyId);
  const expiresAt = readString(metadata.rawFrameExpiresAt);
  const cleanupState = readString(metadata.cleanupState);
  const protectionStatus = readString(metadata.protectionStatus);
  if (!policyId && !expiresAt && !cleanupState && !protectionStatus) return undefined;
  return {
    ...(policyId ? { policyId } : {}),
    ...(expiresAt ? { expiresAt } : {}),
    ...(cleanupState ? { cleanupState } : {}),
    ...(protectionStatus ? { protectionStatus } : {})
  };
}

function groupEventsByFrameHash(events: Event[]): Map<string, Event[]> {
  const groups = new Map<string, Event[]>();
  for (const event of events) {
    const frameHash = frameHashForEvent(event);
    if (!frameHash) continue;
    const existing = groups.get(frameHash) ?? [];
    existing.push(event);
    groups.set(frameHash, existing);
  }
  return groups;
}

function frameHashForEvent(event: Event): string | undefined {
  const metadata = event.content.metadata ?? {};
  return readString(metadata.frameHash) ?? readString(metadata.sourceFrameHash);
}

function linkedEvent(event: Event): ActivityFrameLinkedEvent {
  const linked: ActivityFrameLinkedEvent = {
    id: event.id,
    type: event.type,
    sourcePointer: event.source.pointer,
    occurredAt: event.occurredAt
  };
  const summary = event.content.summary ?? event.content.title;
  if (summary) linked.summary = summary;
  return linked;
}

function sortLinkedFrameEvents(events: Event[]): Event[] {
  return [...events].sort((left, right) => {
    const byKind = frameEventRank(left) - frameEventRank(right);
    if (byKind !== 0) return byKind;
    const byTime = left.occurredAt.localeCompare(right.occurredAt);
    return byTime === 0 ? left.id.localeCompare(right.id) : byTime;
  });
}

function frameEventRank(event: Event): number {
  if (event.type === "screen_observation") return 0;
  if (event.type === "ocr_text") return 1;
  return 2;
}

function buildScrubberMarkers(
  session: ActivitySession,
  frames: ActivityPlaybackFrame[]
): ActivityPlaybackResult["scrubber"]["markers"] {
  const start = new Date(session.startAt).getTime();
  const duration = Math.max(1, new Date(session.endAt).getTime() - start);
  return frames.map((frame, index) => ({
    frameId: frame.frameId,
    position: framePosition(frame.timestamp, start, duration, index, frames.length),
    timestamp: frame.timestamp,
    rawState: frame.rawState
  }));
}

function framePosition(
  timestamp: string,
  sessionStart: number,
  duration: number,
  fallbackIndex: number,
  fallbackTotal: number
): number {
  const occurred = new Date(timestamp).getTime();
  if (!Number.isNaN(occurred)) {
    return Math.min(100, Math.max(0, ((occurred - sessionStart) / duration) * 100));
  }
  if (fallbackTotal <= 1) return 0;
  return (fallbackIndex / (fallbackTotal - 1)) * 100;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
