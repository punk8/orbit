import type { ActivitySession, Event, SourceKind } from "../index";
import { evidenceFromEvent } from "../evidence";
import { createStableId } from "../id";
import { maxSensitivity } from "../sensitivity";
import { activityGroupKey } from "./groupingRules";

const DEFAULT_OBSERVATION_IDLE_THRESHOLD_MS = 15 * 60 * 1000;

const OBSERVATION_EVENT_TYPES = new Set<Event["type"]>([
  "app_focus",
  "window_focus",
  "window_title_change",
  "accessibility_snapshot",
  "browser_navigation",
  "terminal_command",
  "terminal_output_summary",
  "clipboard_change",
  "file_activity",
  "screen_observation",
  "ocr_text",
  "audio_segment",
  "transcript_segment",
  "observation_state",
  "permission_state"
]);

export interface BuildActivitySessionsOptions {
  now?: Date;
  observationIdleThresholdMs?: number;
}

export function buildActivitySessions(
  events: Event[],
  options: BuildActivitySessionsOptions = {}
): ActivitySession[] {
  const sorted = [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const groups = new Map<string, Event[]>();

  for (const event of sorted) {
    const key = activityGroupKey(event);
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }

  return [...groups.entries()].flatMap(([key, groupEvents]) =>
    splitEventGroup(key, groupEvents, options).map((segment) => {
      const state: {
        closed: boolean;
        closeReason?: "idle" | "explicit_boundary" | "historical";
      } = {
        closed: segment.closed,
      };
      if (segment.closeReason) {
        state.closeReason = segment.closeReason;
      }
      return buildSession(segment.key, segment.events, state);
    })
  );
}

function splitEventGroup(
  key: string,
  events: Event[],
  options: BuildActivitySessionsOptions
): Array<{
  key: string;
  events: Event[];
  closed: boolean;
  closeReason?: "idle" | "explicit_boundary" | "historical";
}> {
  if (!isObservationGroup(events)) {
    return [{ key, events, closed: true, closeReason: "historical" }];
  }

  const thresholdMs =
    options.observationIdleThresholdMs ?? DEFAULT_OBSERVATION_IDLE_THRESHOLD_MS;
  const now = options.now ?? new Date();
  const segments: Event[][] = [];
  let current: Event[] = [];

  for (const event of events) {
    const previous = current[current.length - 1];
    if (previous && startsNewObservationSegment(previous, event, thresholdMs)) {
      segments.push(current);
      current = [];
    }
    current.push(event);
  }
  if (current.length > 0) segments.push(current);

  return segments.map((segment, index) => {
    const last = segment[segment.length - 1]!;
    const next = segments[index + 1]?.[0];
    const explicitBoundary = last.type === "observation_state" || last.type === "permission_state";
    const idleClosed =
      next !== undefined ||
      now.getTime() - new Date(last.occurredAt).getTime() >= thresholdMs;
    const result: {
      key: string;
      events: Event[];
      closed: boolean;
      closeReason?: "idle" | "explicit_boundary" | "historical";
    } = {
      key: `${key}|observation:${segment[0]!.occurredAt}`,
      events: segment,
      closed: explicitBoundary || idleClosed
    };
    if (explicitBoundary) {
      result.closeReason = "explicit_boundary";
    } else if (idleClosed) {
      result.closeReason = "idle";
    }
    return result;
  });
}

function buildSession(
  key: string,
  events: Event[],
  state: {
    closed: boolean;
    closeReason?: "idle" | "explicit_boundary" | "historical";
  }
): ActivitySession {
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

  const localState: ActivitySession["localState"] = {
    rawAvailable: false,
    indexed: true,
    closed: state.closed
  };
  if (state.closeReason) {
    localState.closeReason = state.closeReason;
  }

  const session: ActivitySession = {
    id: createStableId("activity", sessionIdInput(key, events, eventIds)),
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
    localState,
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

function sessionIdInput(key: string, events: Event[], eventIds: string[]): unknown {
  if (isObservationGroup(events)) {
    return { key, startAt: events[0]?.occurredAt };
  }
  return { key, eventIds };
}

function isObservationGroup(events: Event[]): boolean {
  return events.length > 0 && events.every(isObservationEvent);
}

function isObservationEvent(event: Event): boolean {
  return OBSERVATION_EVENT_TYPES.has(event.type);
}

function startsNewObservationSegment(previous: Event, event: Event, thresholdMs: number): boolean {
  if (previous.type === "observation_state" || previous.type === "permission_state") return true;
  const previousTime = new Date(previous.occurredAt).getTime();
  const nextTime = new Date(event.occurredAt).getTime();
  if (Number.isNaN(previousTime) || Number.isNaN(nextTime)) return false;
  return nextTime - previousTime > thresholdMs;
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
