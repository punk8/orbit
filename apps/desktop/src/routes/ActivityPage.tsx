import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import type { ActivitySession, Event } from "@orbit/core";
import { ChevronLeft, ChevronRight, Maximize2, Play, Search, ShieldCheck } from "lucide-react";
import type { DesktopActivitySessionDetail } from "../orbitApi";
import { EvidenceList } from "../components/EvidenceList";
import { Section } from "../components/Section";
import { useI18n } from "../i18n";

type DateFilter = "all" | "today" | "yesterday" | "custom";

interface ActivityFilters {
  date: DateFilter;
  customDate: string;
  sourceKind: string;
  app: string;
  project: string;
  sensitivity: string;
  query: string;
}

interface PlaybackFrame {
  id: string;
  time: string;
  label: string;
  summary: string;
  position: number;
  rawRef?: string;
}

const defaultFilters: ActivityFilters = {
  date: "all",
  customDate: "",
  sourceKind: "",
  app: "",
  project: "",
  sensitivity: "",
  query: ""
};

export function ActivityPage({ sessions }: { sessions: ActivitySession[] }): ReactElement {
  const { t, sourceKind, formatTimeRange } = useI18n();
  const [filters, setFilters] = useState<ActivityFilters>(defaultFilters);
  const [selectedId, setSelectedId] = useState<string | undefined>(sessions[0]?.id);
  const [detail, setDetail] = useState<DesktopActivitySessionDetail | undefined>();
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | undefined>();

  const filterOptions = useMemo(() => buildFilterOptions(sessions), [sessions]);
  const filteredSessions = useMemo(
    () => sessions.filter((session) => matchesFilters(session, filters)),
    [filters, sessions]
  );
  const selectedSession = filteredSessions.find((session) => session.id === selectedId);

  useEffect(() => {
    if (filteredSessions.some((session) => session.id === selectedId)) return;
    setSelectedId(filteredSessions[0]?.id);
  }, [filteredSessions, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(undefined);
      setDetailError(undefined);
      return;
    }

    let cancelled = false;
    setIsDetailLoading(true);
    setDetailError(undefined);
    void window.orbit
      .getActivitySessionDetail(selectedId)
      .then((nextDetail) => {
        if (!cancelled) {
          setDetail(nextDetail);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setDetail(undefined);
          setDetailError(reason instanceof Error ? reason.message : t("error.activityDetail"));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsDetailLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId, t]);

  return (
    <div className="page-grid activity-playback-page">
      <Section title={t("section.activityTimeline")}>
        <div className="activity-playback-workbench">
          <aside className="activity-timeline-rail" aria-label={t("activity.sessionList")}>
            <div className="activity-rail-tabs" aria-label={t("activity.timelineViews")}>
              <button className="active" type="button">
                {t("activity.timeline")}
              </button>
              <button type="button">{t("activity.overview")}</button>
            </div>

            <label className="activity-rail-search">
              <Search aria-hidden="true" size={14} />
              <input
                aria-label={t("filter.search")}
                value={filters.query}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, query: event.target.value }))
                }
                placeholder={t("activity.searchPlaceholder")}
                type="search"
              />
            </label>

            <div className="activity-rail-filters">
              <select
                aria-label={t("filter.date")}
                value={filters.date}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    date: event.target.value as DateFilter
                  }))
                }
              >
                <option value="all">{t("filter.allDates")}</option>
                <option value="today">{t("filter.today")}</option>
                <option value="yesterday">{t("filter.yesterday")}</option>
                <option value="custom">{t("filter.customDate")}</option>
              </select>
              {filters.date === "custom" ? (
                <input
                  aria-label={t("filter.customDate")}
                  type="date"
                  value={filters.customDate}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, customDate: event.target.value }))
                  }
                />
              ) : null}
              <select
                aria-label={t("filter.source")}
                value={filters.sourceKind}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, sourceKind: event.target.value }))
                }
              >
                <option value="">{t("filter.allSources")}</option>
                {filterOptions.sourceKinds.map((kind) => (
                  <option key={kind} value={kind}>
                    {sourceKind(kind)}
                  </option>
                ))}
              </select>
            </div>

            <div className="activity-rail-list">
              <div className="activity-day-label">{t("filter.today")}</div>
              {filteredSessions.map((session) => (
                <button
                  className={`activity-timeline-item ${selectedId === session.id ? "active" : ""}`}
                  key={session.id}
                  onClick={() => setSelectedId(session.id)}
                  type="button"
                >
                  <span className="activity-timeline-accent" aria-hidden="true" />
                  <span className="activity-timeline-main">
                    <span className="activity-timeline-time">
                      {formatTimeRange(session.startAt, session.endAt)}
                    </span>
                    <span className="activity-timeline-context">
                      {formatSessionContext(
                        session.sourceKinds.map(sourceKind),
                        session.apps,
                        t("fallback.unknownApp")
                      )}
                    </span>
                  </span>
                  <span className="activity-timeline-count">
                    {session.eventCount} {t("unit.events")}
                  </span>
                </button>
              ))}
              {filteredSessions.length === 0 ? (
                <div className="empty-state compact">{t("empty.noActivitySessions")}</div>
              ) : null}
            </div>

            <div className="activity-local-note">
              <ShieldCheck aria-hidden="true" size={15} />
              <span>{t("activity.localCleanupNotice")}</span>
            </div>
          </aside>

          <div className="activity-detail-pane">
            {selectedSession ? (
              <ActivityDetail
                detail={detail}
                fallbackSession={selectedSession}
                isLoading={isDetailLoading}
                error={detailError}
                formatTimeRange={formatTimeRange}
              />
            ) : (
              <div className="empty-state">{t("empty.noActivitySessions")}</div>
            )}
          </div>
        </div>
      </Section>
    </div>
  );
}

function ActivityDetail({
  detail,
  fallbackSession,
  isLoading,
  error,
  formatTimeRange
}: {
  detail: DesktopActivitySessionDetail | undefined;
  fallbackSession: ActivitySession;
  isLoading: boolean;
  error: string | undefined;
  formatTimeRange(startAt: string, endAt: string): string;
}): ReactElement {
  const { t, sourceKind, status } = useI18n();
  const session = detail?.session ?? fallbackSession;
  const events = detail?.events ?? [];
  const frames = buildPlaybackFrames(session, events);
  const currentFrame = frames[0];

  if (error) {
    return <div className="error-banner inline">{error}</div>;
  }

  return (
    <div className="detail-stack activity-playback-detail">
      <header className="activity-playback-header">
        <div>
          <h2>{formatTimeRange(session.startAt, session.endAt)}</h2>
          <div className="activity-session-meta">
            <span>{formatDuration(session.durationSeconds)}</span>
            <span>
              {session.eventCount} {t("unit.events")}
            </span>
            <span>
              {frames.length} {t("activity.frames")}
            </span>
            <span>{session.sourceKinds.map(sourceKind).join(", ") || t("fallback.none")}</span>
            <span>
              {session.localState.rawAvailable ? t("activity.rawAvailable") : t("activity.localOnly")}
            </span>
          </div>
        </div>
        <button
          aria-label={t("activity.closeDetail")}
          className="activity-detail-close"
          type="button"
        >
          ×
        </button>
      </header>

      {isLoading ? <div className="empty-state compact">{t("activity.loadingDetail")}</div> : null}

      <section className="activity-recording-section">
        <h3>{t("activity.recording")}</h3>
        <div className="activity-recording-viewer">
          <button
            aria-label={t("activity.previousFrame")}
            className="activity-frame-nav left"
            type="button"
          >
            <ChevronLeft aria-hidden="true" size={18} />
          </button>

          <div className="activity-frame-stage">
            {session.localState.rawAvailable && currentFrame?.rawRef ? (
              <div className="activity-frame-available">
                <p>{currentFrame.summary}</p>
                <code>{currentFrame.rawRef}</code>
              </div>
            ) : (
              <div className="activity-frame-empty">
                <div className="activity-frame-empty-mark">
                  <Play aria-hidden="true" size={34} />
                </div>
                <h4>{t("activity.noRawFramesYet")}</h4>
                <p>{currentFrame?.summary ?? session.summary ?? t("fallback.noSummary")}</p>
                <span>{t("activity.noRawFramesReason")}</span>
              </div>
            )}
          </div>

          <button
            aria-label={t("activity.nextFrame")}
            className="activity-frame-nav right"
            type="button"
          >
            <ChevronRight aria-hidden="true" size={18} />
          </button>
          <button
            aria-label={t("activity.fullscreen")}
            className="activity-frame-fullscreen"
            type="button"
          >
            <Maximize2 aria-hidden="true" size={16} />
          </button>
        </div>

        <div className="activity-frame-scrubber" aria-label={t("activity.frameScrubber")}>
          {frames.map((frame, index) => (
            <span
              className={`activity-frame-marker ${index === 0 ? "active" : ""}`}
              key={frame.id}
              style={{ left: `${frame.position}%` }}
              title={`${frame.label} ${frame.time}`}
            />
          ))}
        </div>

        <div className="activity-playback-controls">
          <button aria-label={t("activity.play")} type="button">
            <Play aria-hidden="true" size={14} />
          </button>
          <button aria-label={t("activity.previousFrame")} type="button">
            <ChevronLeft aria-hidden="true" size={14} />
          </button>
          <span>
            {frames.length ? `1 / ${frames.length}` : `0 / 0`}
          </span>
          <button aria-label={t("activity.nextFrame")} type="button">
            <ChevronRight aria-hidden="true" size={14} />
          </button>
          <span>{currentFrame?.time ?? formatEventTime(session.startAt)}</span>
        </div>
      </section>

      <DetailBlock title={t("activity.summary")}>
        <p>{session.summary ?? t("fallback.noSummary")}</p>
      </DetailBlock>

      <DetailBlock title={t("activity.eventStream")}>
        {events.length ? (
          <div className="event-stream">
            {events.map((event) => (
              <article className="event-row" key={event.id}>
                <div className="event-row-time">{formatEventTime(event.occurredAt)}</div>
                <div>
                  <div className="item-heading">
                    <h3>{formatEventTitle(event, t)}</h3>
                    <span>{humanizeValue(event.type)}</span>
                  </div>
                  <p>{formatEventPreview(event, t)}</p>
                  <div className="meta-line">
                    <span>{sourceKind(event.source.kind)}</span>
                    <code>{event.source.pointer}</code>
                    <span>{event.context.app ?? t("fallback.unknownApp")}</span>
                    <span>{t(`redaction.${event.privacy.redactionState}`)}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state compact">
            {isLoading ? t("activity.loadingDetail") : t("activity.noLinkedEvents")}
          </div>
        )}
      </DetailBlock>

      <div className="activity-evidence-grid">
        <DetailBlock title={t("activity.evidence")}>
          <EvidenceList evidence={session.evidence} limit={12} />
        </DetailBlock>

        <DetailBlock title={t("activity.sourcePolicy")}>
          {session.localState.sourcePolicies?.length ? (
            <div className="source-policy-list">
              {session.localState.sourcePolicies.map((policy) => (
                <article key={`${policy.sourceAdapterId}-${policy.sourceKind}`}>
                  <div className="item-heading">
                    <h3>{sourceKind(policy.sourceKind)}</h3>
                    <span>{policy.sourceAdapterId}</span>
                  </div>
                  <div className="meta-line">
                    <span>
                      {policy.canStoreRaw ? t("activity.policyRawOn") : t("activity.policyRawOff")}
                    </span>
                    <span>
                      {policy.canUseForAI ? t("activity.policyAiOn") : t("activity.policyAiOff")}
                    </span>
                    <span>
                      {policy.canExportToAgent
                        ? t("activity.policyExportOn")
                        : t("activity.policyExportOff")}
                    </span>
                    <span>{policy.retentionPolicyId}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">{t("fallback.none")}</p>
          )}
        </DetailBlock>
      </div>

      <div className="detail-columns">
        <DetailBlock title={t("activity.processing")}>
          <dl className="mini-grid">
            <DetailField
              label={t("activity.indexedState")}
              value={session.localState.indexed ? t("state.yes") : t("state.no")}
            />
            <DetailField
              label={t("activity.classification")}
              value={
                detail?.events.some((event) => event.classification)
                  ? t("state.available")
                  : t("state.notConfigured")
              }
            />
            <DetailField label={t("activity.embedding")} value={t("state.disabled")} />
            <DetailField label={t("activity.aiSummary")} value={t("state.notConfigured")} />
            <DetailField
              label={t("activity.providerBoundary")}
              value={t("activity.providerLocal")}
            />
          </dl>
        </DetailBlock>

        <DetailBlock title={t("activity.storage")}>
          <dl className="mini-grid">
            <DetailField
              label={t("activity.rawState")}
              value={
                session.localState.rawAvailable
                  ? t("activity.rawAvailable")
                  : t("activity.rawUnavailable")
              }
            />
            <DetailField
              label={t("activity.storageBytes")}
              value={formatBytes(session.localState.storageBytes)}
            />
            <DetailField
              label={t("activity.redaction")}
              value={formatRedactionState(detail?.events, t)}
            />
            <DetailField
              label={t("activity.retention")}
              value={session.privacy.retentionPolicyId}
            />
          </dl>
        </DetailBlock>
      </div>

      <DetailBlock title={t("activity.derivedObjects")}>
        {detail ? (
          <div className="derived-grid">
            <DerivedList
              title={t("nav.knowledge")}
              items={detail.linkedKnowledge.map((item) => `${item.title} (${status(item.status)})`)}
            />
            <DerivedList
              title={t("nav.memory")}
              items={detail.linkedMemories.map((item) => `${item.title} (${status(item.status)})`)}
            />
            <DerivedList
              title={t("nav.recommendations")}
              items={detail.linkedRecommendations.map(
                (item) => `${item.title} (${status(item.status)})`
              )}
            />
          </div>
        ) : (
          <div className="empty-state compact">{t("activity.loadingDetail")}</div>
        )}
      </DetailBlock>
    </div>
  );
}

function DetailBlock({
  title,
  children
}: {
  title: string;
  children: ReactElement | ReactElement[] | string;
}): ReactElement {
  return (
    <section className="detail-block">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function DetailField({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function DerivedList({ title, items }: { title: string; items: string[] }): ReactElement {
  const { t } = useI18n();
  return (
    <div className="derived-list">
      <h4>{title}</h4>
      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="muted">{t("fallback.none")}</p>
      )}
    </div>
  );
}

function buildPlaybackFrames(session: ActivitySession, events: Event[]): PlaybackFrame[] {
  const sessionStart = new Date(session.startAt).getTime();
  const sessionEnd = new Date(session.endAt).getTime();
  const duration = Math.max(1, sessionEnd - sessionStart);

  const sourceEvents = events.filter((event) => isFrameLikeEvent(event));
  const eventFrames: PlaybackFrame[] = sourceEvents.map((event, index) => {
    const frame: PlaybackFrame = {
      id: event.id,
      time: formatEventTime(event.occurredAt),
      label: humanizeValue(event.source.kind),
      summary: formatFrameSummary(event),
      position: framePosition(event.occurredAt, sessionStart, duration, index, sourceEvents.length)
    };
    if (event.content.rawRef) frame.rawRef = event.content.rawRef;
    return frame;
  });

  const mediaRefs = [
    ...(session.media?.screenshotRefs ?? []),
    ...(session.media?.recordingRefs ?? [])
  ];
  const mediaFrames = mediaRefs.map((rawRef, index) => ({
    id: `${session.id}:media:${index}`,
    time: index === 0 ? formatEventTime(session.startAt) : formatEventTime(session.endAt),
    label: "media",
    summary: rawRef,
    position: mediaRefs.length <= 1 ? 0 : (index / (mediaRefs.length - 1)) * 100,
    rawRef
  }));

  const frames = [...mediaFrames, ...eventFrames];
  if (frames.length) return frames.slice(0, 24);

  return [
    {
      id: `${session.id}:summary`,
      time: formatEventTime(session.startAt),
      label: "summary",
      summary: session.summary ?? session.title,
      position: 0
    }
  ];
}

function isFrameLikeEvent(event: Event): boolean {
  return event.type === "screen_observation" || event.type === "ocr_text";
}

function formatFrameSummary(event: Event): string {
  return event.content.summary ?? event.content.text ?? event.content.title ?? event.source.pointer;
}

function framePosition(
  occurredAt: string,
  sessionStart: number,
  duration: number,
  fallbackIndex: number,
  fallbackTotal: number
): number {
  const occurred = new Date(occurredAt).getTime();
  if (!Number.isNaN(occurred)) {
    return Math.min(100, Math.max(0, ((occurred - sessionStart) / duration) * 100));
  }
  if (fallbackTotal <= 1) return 0;
  return (fallbackIndex / (fallbackTotal - 1)) * 100;
}

function buildFilterOptions(sessions: ActivitySession[]): {
  sourceKinds: string[];
  apps: string[];
  projects: string[];
  sensitivities: string[];
} {
  return {
    sourceKinds: sortedUnique(sessions.flatMap((session) => session.sourceKinds)),
    apps: sortedUnique(sessions.flatMap((session) => session.apps)),
    projects: sortedUnique(sessions.map((session) => session.project).filter(Boolean)),
    sensitivities: sortedUnique(sessions.map((session) => session.privacy.sensitivity))
  };
}

function matchesFilters(session: ActivitySession, filters: ActivityFilters): boolean {
  if (!matchesDateFilter(session, filters)) return false;
  if (filters.sourceKind && !session.sourceKinds.some((kind) => kind === filters.sourceKind)) {
    return false;
  }
  if (filters.app && !session.apps.includes(filters.app)) return false;
  if (filters.project && session.project !== filters.project) return false;
  if (filters.sensitivity && session.privacy.sensitivity !== filters.sensitivity) return false;
  const query = filters.query.trim().toLowerCase();
  if (!query) return true;
  return [
    session.title,
    session.summary,
    session.topic,
    session.project,
    session.apps.join(" "),
    session.sourceKinds.join(" "),
    session.evidence.map((ref) => `${ref.sourcePointer} ${ref.excerpt ?? ""}`).join(" ")
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function matchesDateFilter(session: ActivitySession, filters: ActivityFilters): boolean {
  if (filters.date === "all") return true;
  const sessionDate = localDateKey(session.startAt);
  if (filters.date === "custom")
    return filters.customDate ? sessionDate === filters.customDate : true;
  if (filters.date === "today") return sessionDate === localDateKey(new Date());
  return sessionDate === localDateKey(addDays(new Date(), -1));
}

function formatSessionContext(
  sourceLabels: string[],
  appLabels: string[],
  fallback: string
): string {
  const labels = [...sourceLabels, ...(appLabels.length ? appLabels : [fallback])];
  return Array.from(new Set(labels)).join(", ");
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function formatBytes(value: number | undefined): string {
  if (value === undefined) return "0 B";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatEventTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}

function formatEventTitle(event: Event, t: ReturnType<typeof useI18n>["t"]): string {
  return (
    event.content.title ||
    event.content.summary ||
    event.source.pointer ||
    t("activity.untitledEvent")
  );
}

function formatEventPreview(event: Event, t: ReturnType<typeof useI18n>["t"]): string {
  if (event.privacy.sensitivity === "secret") return t("fallback.redacted");
  if (event.privacy.redactionState === "failed") return t("activity.redactionFailedPreview");
  return event.content.summary ?? event.content.text ?? t("fallback.noSummary");
}

function formatRedactionState(
  events: Event[] | undefined,
  t: ReturnType<typeof useI18n>["t"]
): string {
  if (!events?.length) return t("fallback.none");
  const states = sortedUnique(events.map((event) => event.privacy.redactionState));
  return states.map((state) => t(`redaction.${state}`)).join(", ");
}

function sortedUnique<T extends string>(values: Array<T | undefined>): T[] {
  return Array.from(new Set(values.filter(Boolean) as T[])).sort((a, b) => a.localeCompare(b));
}

function localDateKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function humanizeValue(value: string): string {
  return value.replaceAll("_", " ");
}
