import type { ActivitySession, Event } from "@orbit/core";
import { ActivityRepository, EventRepository, openOrbitDatabase } from "@orbit/db";
import { getCliConfig } from "../config";

export type ActivityFrameRawState = "available" | "raw_expired" | "not_stored";

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
  rawAvailable: boolean;
  rawState: ActivityFrameRawState;
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
    const rawAvailable = Boolean(event.content.rawRef);
    return {
      frameId: frameHash,
      frameIndex: index,
      timestamp: event.occurredAt,
      sourcePointer: event.source.pointer,
      ...(event.context.app ? { app: event.context.app } : {}),
      ...(event.context.windowTitle ? { windowTitle: event.context.windowTitle } : {}),
      summary: event.content.summary ?? event.content.title ?? event.source.pointer,
      rawAvailable,
      rawState: rawAvailable ? "available" : "raw_expired",
      redactionState: event.privacy.redactionState,
      ocrStatus: linkedEvents.some((item) => item.type === "ocr_text") ? "completed" : "pending",
      linkedEvents: linkedEvents.map(linkedEvent)
    };
  });
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
