import type { ActivitySession } from "@orbit/core";

export type ActivityOverviewRange = "day" | "week";

export interface ActivityOverviewLink {
  id: string;
  title: string;
  startAt: string;
}

export interface ActivityOverviewBucket {
  label: string;
  count: number;
  sessionIds: string[];
}

export interface ActivityOverviewWorkItem {
  sessionId: string;
  text: string;
  sourcePointer?: string;
}

export interface ActivityOverviewWarning {
  sessionId: string;
  title: string;
  reason: string;
}

export interface ActivityOverview {
  range: ActivityOverviewRange;
  label: string;
  activeSeconds: number;
  sessionCount: number;
  appCount: number;
  peakHourLabel: string;
  frameCount: number;
  ocrPageCount: number;
  ocrTextChars: number;
  protectedSkipCount: number;
  rawAvailableCount: number;
  topApps: ActivityOverviewBucket[];
  topicClusters: ActivityOverviewBucket[];
  done: ActivityOverviewWorkItem[];
  decisions: ActivityOverviewWorkItem[];
  open: ActivityOverviewWorkItem[];
  next: ActivityOverviewWorkItem[];
  lowQualityWarnings: ActivityOverviewWarning[];
  sessionLinks: ActivityOverviewLink[];
}

export function buildActivityOverview(
  sessions: ActivitySession[],
  range: ActivityOverviewRange,
  label: string
): ActivityOverview {
  const scopedSessions = sessions.filter((session) => matchesRange(session, range, label));
  return {
    range,
    label,
    activeSeconds: scopedSessions.reduce((total, session) => total + session.durationSeconds, 0),
    sessionCount: scopedSessions.length,
    appCount: new Set(scopedSessions.flatMap((session) => session.apps)).size,
    peakHourLabel: peakHour(scopedSessions),
    frameCount: sumLocalSignal(scopedSessions, "frameCount"),
    ocrPageCount: sumLocalSignal(scopedSessions, "ocrPageCount"),
    ocrTextChars: sumLocalSignal(scopedSessions, "ocrTextChars"),
    protectedSkipCount: sumLocalSignal(scopedSessions, "protectedSkipCount"),
    rawAvailableCount: scopedSessions.filter((session) => session.localState.rawAvailable).length,
    topApps: rankBuckets(scopedSessions.flatMap((session) => session.apps.map((app) => [app, session.id] as const))),
    topicClusters: rankBuckets(
      scopedSessions.map((session) => [session.topic ?? session.project ?? "untitled", session.id] as const)
    ),
    done: extractWorkItems(scopedSessions, "done"),
    decisions: extractWorkItems(scopedSessions, "decision"),
    open: extractWorkItems(scopedSessions, "open"),
    next: extractWorkItems(scopedSessions, "next"),
    lowQualityWarnings: scopedSessions
      .filter((session) => session.localState.qualitySignals?.isLowQuality)
      .map((session) => ({
        sessionId: session.id,
        title: session.title,
        reason: session.localState.qualitySignals?.reasons[0] ?? "low_quality"
      })),
    sessionLinks: scopedSessions.map((session) => ({
      id: session.id,
      title: session.title,
      startAt: session.startAt
    }))
  };
}

export function currentActivityOverviewLabels(now = new Date()): { day: string; week: string } {
  return {
    day: localDateKey(now),
    week: localWeekKey(now)
  };
}

function matchesRange(session: ActivitySession, range: ActivityOverviewRange, label: string): boolean {
  if (range === "day") return localDateKey(new Date(session.startAt)) === label;
  return localWeekKey(new Date(session.startAt)) === label;
}

function sumLocalSignal(
  sessions: ActivitySession[],
  field: "frameCount" | "ocrPageCount" | "ocrTextChars" | "protectedSkipCount"
): number {
  return sessions.reduce((total, session) => {
    const direct = session.localState[field];
    const quality = session.localState.qualitySignals?.[field];
    return total + (direct ?? quality ?? 0);
  }, 0);
}

function peakHour(sessions: ActivitySession[]): string {
  if (sessions.length === 0) return "--:--";
  const counts = new Map<string, number>();
  for (const session of sessions) {
    const date = new Date(session.startAt);
    if (Number.isNaN(date.getTime())) continue;
    const label = `${date.getHours().toString().padStart(2, "0")}:00`;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? "--:--";
}

function rankBuckets(entries: Array<readonly [string, string]>): ActivityOverviewBucket[] {
  const buckets = new Map<string, { label: string; sessionIds: string[]; firstIndex: number }>();
  entries.forEach(([label, sessionId], index) => {
    const bucket = buckets.get(label);
    if (bucket) {
      if (!bucket.sessionIds.includes(sessionId)) bucket.sessionIds.push(sessionId);
    } else {
      buckets.set(label, { label, sessionIds: [sessionId], firstIndex: index });
    }
  });
  return [...buckets.values()]
    .map((bucket) => ({
      label: bucket.label,
      count: bucket.sessionIds.length,
      sessionIds: bucket.sessionIds,
      firstIndex: bucket.firstIndex
    }))
    .sort((left, right) => right.count - left.count || left.firstIndex - right.firstIndex)
    .map(({ label, count, sessionIds }) => ({ label, count, sessionIds }))
    .slice(0, 6);
}

function extractWorkItems(
  sessions: ActivitySession[],
  kind: "done" | "decision" | "open" | "next"
): ActivityOverviewWorkItem[] {
  return sessions.flatMap((session) => {
    const text = session.summary ?? session.title;
    const items = extractTaggedSentences(text, kind);
    return items.map((item) => ({
      sessionId: session.id,
      text: item,
      ...(session.evidence[0]?.sourcePointer ? { sourcePointer: session.evidence[0].sourcePointer } : {})
    }));
  });
}

function extractTaggedSentences(text: string, kind: "done" | "decision" | "open" | "next"): string[] {
  const escapedKind = kind.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `\\b${escapedKind}\\s*:\\s*([^.!?。！？]+[.!?。！？]?)`,
    "gi"
  );
  const matches: string[] = [];
  for (const match of text.matchAll(pattern)) {
    const body = match[1]?.trim();
    if (!body) continue;
    matches.push(`${capitalize(kind)}: ${body}`);
  }
  return matches.slice(0, 8);
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function localDateKey(date: Date): string {
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localWeekKey(date: Date): string {
  if (Number.isNaN(date.getTime())) return "";
  const start = startOfIsoWeek(date);
  const year = start.getFullYear();
  const oneJan = new Date(year, 0, 1);
  const days = Math.floor((start.getTime() - oneJan.getTime()) / 86_400_000);
  const week = Math.floor((days + oneJan.getDay() + 6) / 7);
  return `${year}-W${week.toString().padStart(2, "0")}`;
}

function startOfIsoWeek(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  return copy;
}
