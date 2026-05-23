import type { ActivitySession, Event, SourceKind } from "../index";
import { evidenceFromEvent } from "../evidence";
import { createStableId } from "../id";
import { maxSensitivity } from "../sensitivity";
import { activityGroupKey } from "./groupingRules";

const DEFAULT_OBSERVATION_IDLE_THRESHOLD_MS = 15 * 60 * 1000;
const DEFAULT_SHORT_GAP_MERGE_THRESHOLD_MS = 3 * 60 * 1000;
const TOPIC_SHIFT_MIN_GAP_MS = 90 * 1000;
const TOPIC_SIMILARITY_SPLIT_THRESHOLD = 0.18;

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
  shortGapMergeThresholdMs?: number;
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
        boundaryConfidence?: number;
      } = {
        closed: segment.closed
      };
      if (segment.closeReason) {
        state.closeReason = segment.closeReason;
      }
      if (segment.boundaryConfidence !== undefined) {
        state.boundaryConfidence = segment.boundaryConfidence;
      }
      return buildSession(segment.key, segment.events, state);
    })
  );
}

interface ObservationSegment {
  key: string;
  events: Event[];
  closed: boolean;
  closeReason?: NonNullable<ActivitySession["localState"]["closeReason"]>;
  boundaryConfidence?: number;
}

type BoundaryReason = NonNullable<ActivitySession["localState"]["closeReason"]>;

interface BoundaryDecision {
  split: boolean;
  reason?: BoundaryReason;
  confidence?: number;
}

function splitEventGroup(
  key: string,
  events: Event[],
  options: BuildActivitySessionsOptions
): ObservationSegment[] {
  if (!isObservationGroup(events)) {
    return [{ key, events, closed: true, closeReason: "historical", boundaryConfidence: 0.7 }];
  }

  const thresholdMs =
    options.observationIdleThresholdMs ?? DEFAULT_OBSERVATION_IDLE_THRESHOLD_MS;
  const protectedGapThresholdMs = options.protectedGapThresholdMs ?? 2 * 60 * 1000;
  const maxSessionDurationMs = options.maxSessionDurationMs ?? 90 * 60 * 1000;
  const shortGapMergeThresholdMs =
    options.shortGapMergeThresholdMs ?? DEFAULT_SHORT_GAP_MERGE_THRESHOLD_MS;
  const now = options.now ?? new Date();
  const segments: Array<{
    events: Event[];
    closeReason?: BoundaryReason;
    boundaryConfidence?: number;
  }> = [];
  let current: Event[] = [];

  for (const event of events) {
    const boundary = current.length
      ? observationBoundaryDecision(current, event, {
          idleThresholdMs: thresholdMs,
          protectedGapThresholdMs,
          maxSessionDurationMs
        })
      : { split: false };
    if (boundary.split) {
      segments.push({
        events: current,
        ...(boundary.reason ? { closeReason: boundary.reason } : {}),
        ...(boundary.confidence !== undefined ? { boundaryConfidence: boundary.confidence } : {})
      });
      current = [];
    }
    current.push(event);
  }
  if (current.length > 0) segments.push({ events: current });

  const mergedSegments = mergeShortGapSegments(segments, shortGapMergeThresholdMs);

  return mergedSegments.map((segment, index) => {
    const last = segment.events[segment.events.length - 1]!;
    const next = mergedSegments[index + 1]?.events[0];
    const explicitBoundary = isExplicitBoundaryEvent(last);
    const idleClosed =
      next !== undefined || now.getTime() - eventTime(last) >= thresholdMs;
    const closeReason =
      segment.closeReason ?? explicitCloseReason(last) ?? (idleClosed ? "idle_timeout" : undefined);
    const boundaryConfidence =
      segment.boundaryConfidence ??
      (closeReason ? boundaryConfidenceForReason(closeReason) : undefined);
    const result: {
      key: string;
      events: Event[];
      closed: boolean;
      closeReason?: BoundaryReason;
      boundaryConfidence?: number;
    } = {
      key: `${key}|observation:${segment.events[0]!.occurredAt}`,
      events: segment.events,
      closed: explicitBoundary || idleClosed
    };
    if (closeReason) {
      result.closeReason = closeReason;
    }
    if (boundaryConfidence !== undefined) {
      result.boundaryConfidence = boundaryConfidence;
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
    boundaryConfidence?: number;
  }
): ActivitySession {
  const first = events[0];
  const last = events[events.length - 1];
  if (!first || !last) {
    throw new Error("Cannot build an Activity Session from an empty event group");
  }

  const sourceKinds = unique(events.map((event) => event.source.kind));
  const apps = unique(events.map((event) => event.context.app).filter(isPresent));
  const primaryApps = rankedUnique(events.map((event) => event.context.app).filter(isPresent));
  const eventIds = events.map((event) => event.id);
  const topic = inferSessionTopic(events);
  const title = buildSessionTitle(events, topic);
  const sensitivity = maxSensitivity(events.map((event) => event.privacy.sensitivity));
  const start = new Date(first.occurredAt);
  const end = new Date(last.occurredAt);
  const durationSeconds = Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
  const project = inferSessionProject(events);
  const summary = events
    .map((event) => event.content.summary ?? event.content.title ?? event.content.text)
    .filter(isPresent)
    .slice(0, 3)
    .join(" / ");

  const quality = scoreActivityQuality(events, durationSeconds);
  const protectedSkipCount = countProtectedSkips(events);
  const rawStorageBytes = events.reduce((total, event) => {
    const sizeBytes = readNumber(event.content.metadata?.rawFrameSizeBytes);
    return total + (sizeBytes ?? 0);
  }, 0);
  const rawAvailable = events.some((event) => event.content.metadata?.rawFrameState === "available");
  const localState: ActivitySession["localState"] = {
    rawAvailable,
    indexed: true,
    ...(rawStorageBytes > 0 ? { storageBytes: rawStorageBytes } : {}),
    closed: state.closed,
    ...(state.boundaryConfidence !== undefined
      ? { boundaryConfidence: state.boundaryConfidence }
      : {}),
    ...(primaryApps.length > 0 ? { primaryApps } : {}),
    frameCount: quality.qualitySignals.frameCount,
    ocrPageCount: quality.qualitySignals.ocrPageCount,
    ocrTextChars: quality.qualitySignals.ocrTextChars,
    eventCount: events.length,
    protectedSkipCount,
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
  if (topic) {
    session.topic = topic;
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

export function scoreActivityQuality(
  events: Event[],
  durationSeconds: number
): {
  qualityScore: number;
  qualitySignals: NonNullable<ActivitySession["localState"]["qualitySignals"]>;
} {
  const frameCount = events.filter((event) => event.type === "screen_observation").length;
  const ocrEvents = events.filter((event) => event.type === "ocr_text");
  const ocrPageCount = ocrEvents.reduce((total, event) => {
    const pageCount =
      readNumber(event.content.metadata?.pageCount) ??
      readNumber(event.content.metadata?.snippetCount) ??
      1;
    return total + Math.max(1, pageCount);
  }, 0);
  const ocrTextChars = events
    .filter((event) => event.type === "ocr_text")
    .map((event) => event.content.summary ?? event.content.text ?? "")
    .join("\n").length;
  const appCount = unique(events.map((event) => event.context.app).filter(isPresent)).length;
  const sourceCount = unique(events.map((event) => event.source.kind)).length;
  const protectedSkipCount = countProtectedSkips(events);
  const rawAvailable = events.some((event) => event.content.metadata?.rawFrameState === "available");
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
      ocrPageCount,
      ocrTextChars,
      eventCount: events.length,
      appCount,
      sourceCount,
      protectedSkipCount,
      rawAvailable,
      hasFollowUpOrRisk,
      redactionSafe,
      isLowQuality,
      reasons
    }
  };
}

function observationBoundaryDecision(
  current: Event[],
  next: Event,
  options: {
    idleThresholdMs: number;
    protectedGapThresholdMs: number;
    maxSessionDurationMs: number;
  }
): BoundaryDecision {
  const previous = current[current.length - 1]!;
  const first = current[0]!;
  const previousTime = eventTime(previous);
  const nextTime = eventTime(next);
  const gapMs = nextTime - previousTime;
  if (isExplicitBoundaryEvent(previous)) {
    const reason = explicitCloseReason(previous) ?? "explicit_boundary";
    return { split: true, reason, confidence: boundaryConfidenceForReason(reason) };
  }
  if (Number.isFinite(gapMs) && gapMs > options.idleThresholdMs) {
    if (isSoftIdleContinuation(current, next, gapMs)) {
      return { split: false };
    }
    return { split: true, reason: "idle_timeout", confidence: 0.95 };
  }
  if (
    isProtectedEvent(previous) &&
    Number.isFinite(gapMs) &&
    gapMs >= options.protectedGapThresholdMs
  ) {
    return { split: true, reason: "protected_app_gap", confidence: 0.95 };
  }
  const firstTime = eventTime(first);
  if (Number.isFinite(firstTime) && Number.isFinite(nextTime)) {
    const durationWithNext = nextTime - firstTime;
    if (durationWithNext >= options.maxSessionDurationMs) {
      return { split: true, reason: "max_duration", confidence: 0.9 };
    }
  }
  if (isTopicShift(current, next, gapMs)) {
    return { split: true, reason: "topic_shift", confidence: topicBoundaryConfidence(current, next) };
  }
  return { split: false };
}

function mergeShortGapSegments(
  segments: Array<{
    events: Event[];
    closeReason?: BoundaryReason;
    boundaryConfidence?: number;
  }>,
  thresholdMs: number
): Array<{
  events: Event[];
  closeReason?: BoundaryReason;
  boundaryConfidence?: number;
}> {
  const result: typeof segments = [];
  for (let index = 0; index < segments.length; index += 1) {
    const current = segments[index]!;
    const previous = result[result.length - 1];
    const next = segments[index + 1];
    if (
      previous &&
      next &&
      isShortGapBridge(previous.events, current.events, next.events, thresholdMs)
    ) {
      previous.events = [...previous.events, ...current.events, ...next.events];
      if (next.closeReason) {
        previous.closeReason = next.closeReason;
      } else {
        delete previous.closeReason;
      }
      if (next.boundaryConfidence !== undefined) {
        previous.boundaryConfidence = next.boundaryConfidence;
      } else {
        delete previous.boundaryConfidence;
      }
      index += 1;
      continue;
    }
    result.push({ ...current, events: [...current.events] });
  }
  return result;
}

function isShortGapBridge(
  previous: Event[],
  middle: Event[],
  next: Event[],
  thresholdMs: number
): boolean {
  if (middle.some(isProtectedEvent)) return false;
  const middleDurationMs = eventTime(middle[middle.length - 1]!) - eventTime(middle[0]!);
  const fullGapMs = eventTime(next[0]!) - eventTime(previous[previous.length - 1]!);
  if (!Number.isFinite(middleDurationMs) || !Number.isFinite(fullGapMs)) return false;
  if (middleDurationMs > thresholdMs || fullGapMs > thresholdMs * 2) return false;
  const previousTopic = inferSessionTopic(previous);
  const nextTopic = inferSessionTopic(next);
  if (!previousTopic || !nextTopic || previousTopic !== nextTopic) return false;
  const middleTopic = inferSessionTopic(middle);
  return middleTopic !== previousTopic;
}

function isTopicShift(current: Event[], next: Event, gapMs: number): boolean {
  if (isProtectedEvent(next)) return false;
  if (!Number.isFinite(gapMs) || gapMs < TOPIC_SHIFT_MIN_GAP_MS) return false;
  if (isMeetingLikeSession(current) && isMeetingEvent(next) !== false) return false;
  const currentTopic = inferSessionTopic(current);
  const nextTopic = inferEventTopic(next);
  if (currentTopic && nextTopic && currentTopic === nextTopic) return false;
  if (currentTopic && nextTopic && currentTopic !== nextTopic) {
    const similarity = topicSimilarity(current, next);
    return similarity < 0.42 && hasContextSwitchSignal(current, next);
  }
  const similarity = topicSimilarity(current, next);
  return similarity < TOPIC_SIMILARITY_SPLIT_THRESHOLD && hasContextSwitchSignal(current, next);
}

function isSoftIdleContinuation(
  current: Event[],
  next: Event,
  gapMs: number
): boolean {
  if (gapMs > 20 * 60 * 1000) return false;
  const currentTopic = inferSessionTopic(current);
  const nextTopic = inferEventTopic(next);
  if (!currentTopic || currentTopic !== nextTopic) return false;
  return isMeetingLikeSession(current) || topicSimilarity(current, next) >= 0.25;
}

function hasContextSwitchSignal(current: Event[], next: Event): boolean {
  const previous = current[current.length - 1]!;
  return (
    (previous.context.app && next.context.app && previous.context.app !== next.context.app) ||
    (previous.context.windowTitle &&
      next.context.windowTitle &&
      previous.context.windowTitle !== next.context.windowTitle) ||
    previous.type === "ocr_text" ||
    next.type === "ocr_text" ||
    inferEventTopic(previous) !== inferEventTopic(next)
  );
}

function topicBoundaryConfidence(current: Event[], next: Event): number {
  const similarity = topicSimilarity(current, next);
  if (similarity < 0.1) return 0.8;
  if (similarity < 0.25) return 0.7;
  return 0.65;
}

function topicSimilarity(current: Event[], next: Event): number {
  const currentTokens = sessionTokens(current);
  const nextTokens = eventTokens(next);
  if (currentTokens.size === 0 || nextTokens.size === 0) return 0;
  let intersection = 0;
  for (const token of nextTokens) {
    if (currentTokens.has(token)) intersection += 1;
  }
  const union = new Set([...currentTokens, ...nextTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

function sessionTokens(events: Event[]): Set<string> {
  return new Set(events.flatMap((event) => [...eventTokens(event)]));
}

function eventTokens(event: Event): Set<string> {
  return new Set(
    [
      inferEventTopic(event),
      event.context.app,
      event.context.windowTitle,
      event.content.title,
      event.content.summary,
      event.content.text
    ]
      .filter(isPresent)
      .flatMap(tokenize)
  );
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
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

function isExplicitBoundaryEvent(event: Event): boolean {
  return event.type === "observation_state" || event.type === "permission_state";
}

function isProtectedEvent(event: Event): boolean {
  const title = event.content.title?.toLowerCase() ?? "";
  const summary = event.content.summary?.toLowerCase() ?? "";
  return (
    event.privacy.redactionState === "redacted" &&
    /protected (app|context)|protected app|skipped before capture/i.test(`${title} ${summary}`)
  );
}

function isMeetingEvent(event: Event): boolean {
  return (
    event.type === "meeting" ||
    event.type === "audio_segment" ||
    event.type === "transcript_segment" ||
    event.source.pointer.startsWith("transcript://meeting")
  );
}

function isMeetingLikeSession(events: Event[]): boolean {
  return events.some(isMeetingEvent);
}

function buildSessionTitle(events: Event[], topic: string | undefined): string {
  const first = events[0];
  const project = inferSessionProject(events) ?? first?.context.repository ?? "Work";
  return `${project}: ${topic ?? first?.content.title ?? first?.type ?? "activity"}`;
}

function inferSessionProject(events: Event[]): string | undefined {
  return mostCommon(
    events.map((event) => event.context.project ?? event.context.repository).filter(isPresent)
  );
}

function inferSessionTopic(events: Event[]): string | undefined {
  return mostCommon(events.map(inferEventTopic).filter(isPresent));
}

function inferEventTopic(event: Event): string | undefined {
  return event.classification?.topics[0] ?? readString(event.content.metadata?.topic);
}

function countProtectedSkips(events: Event[]): number {
  return events.filter(isProtectedEvent).length;
}

function unique<T extends string>(values: T[]): T[] {
  return [...new Set(values)];
}

function rankedUnique<T extends string>(values: T[]): T[] {
  const counts = new Map<T, { value: T; count: number; firstIndex: number }>();
  values.forEach((value, index) => {
    const current = counts.get(value);
    if (current) {
      current.count += 1;
    } else {
      counts.set(value, { value, count: 1, firstIndex: index });
    }
  });
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.firstIndex - b.firstIndex)
    .map((entry) => entry.value);
}

function mostCommon<T extends string>(values: T[]): T | undefined {
  return rankedUnique(values)[0];
}

function isPresent<T>(value: T | undefined | null | ""): value is T {
  return value !== undefined && value !== null && value !== "";
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function eventTime(event: Event): number {
  return new Date(event.occurredAt).getTime();
}

function boundaryConfidenceForReason(reason: BoundaryReason): number {
  switch (reason) {
    case "idle_timeout":
    case "protected_app_gap":
      return 0.95;
    case "max_duration":
      return 0.9;
    case "manual_pause":
    case "manual_stop":
    case "scope_changed":
    case "runtime_error":
    case "explicit_boundary":
      return 0.92;
    case "meeting_boundary":
      return 0.75;
    case "project_shift":
    case "day_boundary":
      return 0.8;
    case "topic_shift":
      return 0.7;
    case "historical":
    case "idle":
      return 0.65;
  }
}

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "about",
  "shows",
  "show",
  "text",
  "orbit",
  "activity",
  "session",
  "sessionizer",
  "evidence",
  "window",
  "screen",
  "ocr"
]);
