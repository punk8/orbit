import type { ActivitySession, Event, KnowledgeArtifact, Memory, Recommendation } from "../index";

export interface TodayContext {
  date: string;
  activitySessions: ActivitySession[];
  knowledgeArtifacts: KnowledgeArtifact[];
  memories: Memory[];
  recommendations: Recommendation[];
}

export function buildTodayContext(input: {
  date: string;
  activitySessions: ActivitySession[];
  knowledgeArtifacts: KnowledgeArtifact[];
  memories: Memory[];
  recommendations: Recommendation[];
  matchesDate?: (timestamp: string) => boolean;
  events?: Event[];
}): TodayContext {
  const matchesDate =
    input.matchesDate ?? ((timestamp: string) => isInLocalDate(input.date, timestamp));
  const eventSafety = input.events ? buildTodayEventSafety(input.events) : undefined;
  return {
    date: input.date,
    activitySessions: input.activitySessions
      .filter((session) => matchesDate(session.startAt))
      .map((session) => sanitizeActivitySession(session, eventSafety))
      .filter((session) => session.eventCount > 0 || session.evidence.length > 0),
    knowledgeArtifacts: input.knowledgeArtifacts
      .filter((artifact) => matchesDate(artifact.createdAt))
      .map((artifact) => sanitizeEvidenceObject(artifact, eventSafety))
      .filter((artifact) => artifact.evidence.length > 0 || eventSafety === undefined),
    memories: input.memories
      .filter(
        (memory) =>
          matchesDate(memory.createdAt) || memory.evidence.some((ref) => matchesDate(ref.timestamp))
      )
      .map((memory) => sanitizeEvidenceObject(memory, eventSafety))
      .filter((memory) => memory.evidence.length > 0 || eventSafety === undefined),
    recommendations: input.recommendations
      .filter((recommendation) => matchesDate(recommendation.createdAt))
      .map((recommendation) => sanitizeEvidenceObject(recommendation, eventSafety))
      .filter((recommendation) => recommendation.evidence.length > 0 || eventSafety === undefined)
  };
}

export function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isInLocalDate(dateKey: string, timestamp: string): boolean {
  const date = new Date(timestamp);
  return !Number.isNaN(date.getTime()) && getLocalDateKey(date) === dateKey;
}

function buildTodayEventSafety(events: Event[]): Map<string, boolean> {
  return new Map(
    events.map((event) => [
      event.id,
      event.privacy.sensitivity !== "secret" && event.privacy.redactionState !== "failed"
    ])
  );
}

function sanitizeActivitySession(
  session: ActivitySession,
  eventSafety: Map<string, boolean> | undefined
): ActivitySession {
  if (!eventSafety) return session;
  const eventIds = session.eventIds.filter((eventId) => eventSafety.get(eventId) !== false);
  const safeEventIds = new Set(eventIds);
  const evidence = session.evidence.filter((ref) => !ref.eventId || safeEventIds.has(ref.eventId));
  if (eventIds.length === session.eventIds.length && evidence.length === session.evidence.length) {
    return session;
  }
  return {
    ...session,
    eventIds,
    eventCount: eventIds.length,
    evidence
  };
}

function sanitizeEvidenceObject<T extends { evidence: ActivitySession["evidence"] }>(
  item: T,
  eventSafety: Map<string, boolean> | undefined
): T {
  if (!eventSafety) return item;
  const evidence = item.evidence.filter(
    (ref) => !ref.eventId || eventSafety.get(ref.eventId) !== false
  );
  if (evidence.length === item.evidence.length) return item;
  return {
    ...item,
    evidence
  };
}
