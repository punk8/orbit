import type { ActivitySession, Event, SourceKind } from "../index";
import { evidenceFromEvent } from "../evidence";
import { createStableId } from "../id";
import { maxSensitivity } from "../sensitivity";
import { activityGroupKey } from "./groupingRules";

export function buildActivitySessions(events: Event[]): ActivitySession[] {
  const sorted = [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const groups = new Map<string, Event[]>();

  for (const event of sorted) {
    const key = activityGroupKey(event);
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }

  return [...groups.entries()].map(([key, groupEvents]) => buildSession(key, groupEvents));
}

function buildSession(key: string, events: Event[]): ActivitySession {
  const first = events[0];
  const last = events[events.length - 1];
  if (!first || !last) {
    throw new Error("Cannot build an Activity Session from an empty event group");
  }

  const sourceKinds = unique(events.map((event) => event.source.kind));
  const apps = unique(events.map((event) => event.context.app).filter(isPresent));
  const eventIds = events.map((event) => event.id);
  const title = buildSessionTitle(events);
  const sensitivity = maxSensitivity(events.map((event) => event.privacy.sensitivity));
  const start = new Date(first.occurredAt);
  const end = new Date(last.occurredAt);
  const durationSeconds = Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
  const project = first.context.project ?? first.context.repository;
  const summary = events
    .map((event) => event.content.summary ?? event.content.title ?? event.content.text)
    .filter(isPresent)
    .slice(0, 3)
    .join(" / ");

  const session: ActivitySession = {
    id: createStableId("activity", { key, eventIds }),
    schemaVersion: 1,
    title,
    startAt: first.occurredAt,
    endAt: last.occurredAt,
    durationSeconds,
    sourceKinds: sourceKinds as SourceKind[],
    apps,
    eventCount: events.length,
    eventIds,
    evidence: events.map((event) =>
      evidenceFromEvent(event, event.content.title ?? event.content.summary)
    ),
    localState: {
      rawAvailable: false,
      indexed: true
    },
    privacy: {
      sensitivity,
      retentionPolicyId: "default"
    },
    createdAt: first.observedAt,
    updatedAt: last.observedAt
  };

  if (project) {
    session.project = project;
  }
  if (summary) {
    session.summary = summary;
  }
  return session;
}

function buildSessionTitle(events: Event[]): string {
  const first = events[0];
  const project = first?.context.project ?? first?.context.repository ?? "Work";
  const topic =
    first?.classification?.topics[0] ?? first?.content.title ?? first?.type ?? "activity";
  return `${project}: ${topic}`;
}

function unique<T extends string>(values: T[]): T[] {
  return [...new Set(values)];
}

function isPresent<T>(value: T | undefined | null | ""): value is T {
  return value !== undefined && value !== null && value !== "";
}
