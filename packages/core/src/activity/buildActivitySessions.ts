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
  protectedGapThresholdMs?: number;
  maxSessionDurationMs?: number;
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
        closeReason?: NonNullable<ActivitySession["localState"]["closeReason"]>;
      } = {
        closed: segment.closed
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
  closeReason?: NonNullable<ActivitySession["localState"]["closeReason"]>;
}> {
  if (!isObservationGroup(events)) {
    return [{ key, events, closed: true, closeReason: "historical" }];
  }

  const thresholdMs =
    options.observationIdleThresholdMs ?? DEFAULT_OBSERVATION_IDLE_THRESHOLD_MS;
  const protectedGapThresholdMs = options.protectedGapThresholdMs ?? 2 * 60 * 1000;
  const maxSessionDurationMs = options.maxSessionDurationMs ?? 90 * 60 * 1000;
  const now = options.now ?? new Date();
  const segments: Event[][] = [];
  let current: Event[] = [];

  for (const event of events) {
    const previous = current[current.length - 1];
    const first = current[0];
    if (
      previous &&
      (startsNewObservationSegment(previous, event, thresholdMs) ||
        crossesProtectedGap(previous, event, protectedGapThresholdMs) ||
        crossesMeetingBoundary(previous, event) ||
        (first ? exceedsMaxDuration(first, event, maxSessionDurationMs) : false))
    ) {
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
    const closeReason =
      explicitCloseReason(last) ??
      (next
        ? boundaryCloseReason(last, next, thresholdMs, protectedGapThresholdMs, maxSessionDurationMs)
        : undefined) ??
      (idleClosed ? "idle_timeout" : undefined);
    const result: {
      key: string;
      events: Event[];
      closed: boolean;
      closeReason?: NonNullable<ActivitySession["localState"]["closeReason"]>;
    } = {
      key: `${key}|observation:${segment[0]!.occurredAt}`,
      events: segment,
      closed: explicitBoundary || idleClosed
    };
    if (closeReason) {
      result.closeReason = closeReason;
    }
    return result;
  });
}

function buildSession(
  key: string,
  events: Event[],
  state: {
    closed: boolean;
    closeReason?: NonNullable<ActivitySession["localState"]["closeReason"]>;
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

  const quality = scoreActivityQuality(events, durationSeconds);
  const rawStorageBytes = events.reduce((total, event) => {
    const sizeBytes = readNumber(event.content.metadata?.rawFrameSizeBytes);
    return total + (sizeBytes ?? 0);
  }, 0);
  const localState: ActivitySession["localState"] = {
    rawAvailable: events.some((event) => event.content.metadata?.rawFrameState === "available"),
    indexed: true,
    ...(rawStorageBytes > 0 ? { storageBytes: rawStorageBytes } : {}),
    closed: state.closed,
    qualityScore: quality.qualityScore,
    qualitySignals: quality.qualitySignals
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

export function scoreActivityQuality(
  events: Event[],
  durationSeconds: number
): {
  qualityScore: number;
  qualitySignals: NonNullable<ActivitySession["localState"]["qualitySignals"]>;
} {
  const frameCount = events.filter((event) => event.type === "screen_observation").length;
  const ocrTextChars = events
    .filter((event) => event.type === "ocr_text")
    .map((event) => event.content.summary ?? event.content.text ?? "")
    .join("\n").length;
  const appCount = unique(events.map((event) => event.context.app).filter(isPresent)).length;
  const sourceCount = unique(events.map((event) => event.source.kind)).length;
  const hasFollowUpOrRisk = events.some((event) =>
    /follow\s*up|todo|block|risk|error|失败|待跟进|阻塞|风险/i.test(
      `${event.content.title ?? ""} ${event.content.summary ?? ""} ${event.content.text ?? ""}`
    )
  );
  const redactionSafe = events.every((event) => event.privacy.redactionState !== "failed");
  const reasons: string[] = [];
  let score = 0;
  if (durationSeconds >= 60) score += 0.15;
  else reasons.push("short_duration");
  if (frameCount >= 2) score += 0.25;
  else if (frameCount === 1) score += 0.1;
  else reasons.push("no_screen_frames");
  if (ocrTextChars >= 120) score += 0.25;
  else if (ocrTextChars > 0) score += 0.1;
  else reasons.push("low_ocr_text");
  if (appCount >= 1) score += 0.1;
  if (sourceCount >= 2) score += 0.1;
  if (hasFollowUpOrRisk) score += 0.1;
  if (redactionSafe) score += 0.05;
  else reasons.push("failed_redaction");
  const qualityScore = Math.min(1, Number(score.toFixed(2)));
  const isLowQuality = qualityScore < 0.35;
  if (isLowQuality) reasons.push("below_quality_threshold");
  return {
    qualityScore,
    qualitySignals: {
      durationSeconds,
      frameCount,
      ocrTextChars,
      appCount,
      sourceCount,
      hasFollowUpOrRisk,
      redactionSafe,
      isLowQuality,
      reasons
    }
  };
}

function crossesProtectedGap(previous: Event, next: Event, thresholdMs: number): boolean {
  if (!isProtectedEvent(previous)) return false;
  const previousTime = new Date(previous.occurredAt).getTime();
  const nextTime = new Date(next.occurredAt).getTime();
  if (Number.isNaN(previousTime) || Number.isNaN(nextTime)) return false;
  return nextTime - previousTime >= thresholdMs;
}

function crossesMeetingBoundary(previous: Event, next: Event): boolean {
  return isMeetingEvent(previous) !== isMeetingEvent(next);
}

function exceedsMaxDuration(first: Event, next: Event, maxDurationMs: number): boolean {
  const firstTime = new Date(first.occurredAt).getTime();
  const nextTime = new Date(next.occurredAt).getTime();
  if (Number.isNaN(firstTime) || Number.isNaN(nextTime)) return false;
  return nextTime - firstTime >= maxDurationMs;
}

function explicitCloseReason(
  event: Event
): NonNullable<ActivitySession["localState"]["closeReason"]> | undefined {
  if (event.type !== "observation_state" && event.type !== "permission_state") return undefined;
  const text = `${event.content.title ?? ""} ${event.content.summary ?? ""}`.toLowerCase();
  if (text.includes("pause")) return "manual_pause";
  if (text.includes("stop")) return "manual_stop";
  if (text.includes("scope")) return "scope_changed";
  if (text.includes("error")) return "runtime_error";
  return "explicit_boundary";
}

function boundaryCloseReason(
  previous: Event,
  next: Event,
  idleThresholdMs: number,
  protectedGapThresholdMs: number,
  maxSessionDurationMs: number
): NonNullable<ActivitySession["localState"]["closeReason"]> | undefined {
  if (crossesProtectedGap(previous, next, protectedGapThresholdMs)) return "protected_app_gap";
  if (crossesMeetingBoundary(previous, next)) return "meeting_boundary";
  if (exceedsMaxDuration(previous, next, maxSessionDurationMs)) return "max_duration";
  const previousTime = new Date(previous.occurredAt).getTime();
  const nextTime = new Date(next.occurredAt).getTime();
  if (
    !Number.isNaN(previousTime) &&
    !Number.isNaN(nextTime) &&
    nextTime - previousTime >= idleThresholdMs
  ) {
    return "idle_timeout";
  }
  return "topic_shift";
}

function isProtectedEvent(event: Event): boolean {
  const title = event.content.title?.toLowerCase() ?? "";
  const summary = event.content.summary?.toLowerCase() ?? "";
  return event.privacy.redactionState === "redacted" && `${title} ${summary}`.includes("protected app");
}

function isMeetingEvent(event: Event): boolean {
  return (
    event.type === "meeting" ||
    event.type === "audio_segment" ||
    event.type === "transcript_segment" ||
    event.source.pointer.startsWith("transcript://meeting")
  );
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

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
