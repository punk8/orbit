import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import type { ActivitySession, Event } from "@orbit/core";
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
  const { t, sourceKind, sensitivity, formatDateTimeRange, formatTimeRange } = useI18n();
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
    <div className="page-grid">
      <Section title={t("section.activityTimeline")}>
        <div className="filter-bar">
          <label>
            <span>{t("filter.date")}</span>
            <select
              className="select-input compact-input"
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
          </label>
          {filters.date === "custom" ? (
            <label>
              <span>{t("filter.customDate")}</span>
              <input
                className="text-input compact-input"
                type="date"
                value={filters.customDate}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, customDate: event.target.value }))
                }
              />
            </label>
          ) : null}
          <label>
            <span>{t("filter.source")}</span>
            <select
              className="select-input compact-input"
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
          </label>
          <label>
            <span>{t("filter.app")}</span>
            <select
              className="select-input compact-input"
              value={filters.app}
              onChange={(event) =>
                setFilters((current) => ({ ...current, app: event.target.value }))
              }
            >
              <option value="">{t("filter.allApps")}</option>
              {filterOptions.apps.map((app) => (
                <option key={app} value={app}>
                  {app}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("filter.project")}</span>
            <select
              className="select-input compact-input"
              value={filters.project}
              onChange={(event) =>
                setFilters((current) => ({ ...current, project: event.target.value }))
              }
            >
              <option value="">{t("filter.allProjects")}</option>
              {filterOptions.projects.map((project) => (
                <option key={project} value={project}>
                  {project}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("filter.sensitivity")}</span>
            <select
              className="select-input compact-input"
              value={filters.sensitivity}
              onChange={(event) =>
                setFilters((current) => ({ ...current, sensitivity: event.target.value }))
              }
            >
              <option value="">{t("filter.allSensitivity")}</option>
              {filterOptions.sensitivities.map((value) => (
                <option key={value} value={value}>
                  {sensitivity(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-search">
            <span>{t("filter.search")}</span>
            <input
              className="text-input"
              value={filters.query}
              onChange={(event) =>
                setFilters((current) => ({ ...current, query: event.target.value }))
              }
              placeholder={t("activity.searchPlaceholder")}
              type="search"
            />
          </label>
        </div>

        <div className="activity-workbench">
          <div className="activity-list" aria-label={t("activity.sessionList")}>
            {filteredSessions.map((session) => (
              <button
                className={`activity-list-item ${selectedId === session.id ? "active" : ""}`}
                key={session.id}
                onClick={() => setSelectedId(session.id)}
                type="button"
              >
                <div className="item-heading">
                  <h3>{session.title}</h3>
                  <span>
                    {session.eventCount} {t("unit.events")}
                  </span>
                </div>
                <p>{session.summary ?? t("fallback.noSummary")}</p>
                <div className="meta-line">
                  {formatDateTimeRange(session.startAt, session.endAt)}
                  <span>
                    {formatSessionContext(
                      session.sourceKinds.map(sourceKind),
                      session.apps,
                      t("fallback.unknownApp")
                    )}
                  </span>
                </div>
                <div className="meta-line">
                  <span className={`sensitivity ${session.privacy.sensitivity}`}>
                    {sensitivity(session.privacy.sensitivity)}
                  </span>
                  <span>
                    {session.localState.indexed ? t("activity.indexed") : t("activity.notIndexed")}
                  </span>
                  <span>
                    {session.localState.rawAvailable
                      ? t("activity.rawAvailable")
                      : t("activity.rawUnavailable")}
                  </span>
                </div>
              </button>
            ))}
            {filteredSessions.length === 0 ? (
              <div className="empty-state">{t("empty.noActivitySessions")}</div>
            ) : null}
          </div>

          <div className="activity-detail-pane">
            {selectedSession ? (
              <ActivityDetail
                detail={detail}
                fallbackSession={selectedSession}
                isLoading={isDetailLoading}
                error={detailError}
                formatDateTimeRange={formatDateTimeRange}
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
  formatDateTimeRange,
  formatTimeRange
}: {
  detail: DesktopActivitySessionDetail | undefined;
  fallbackSession: ActivitySession;
  isLoading: boolean;
  error: string | undefined;
  formatDateTimeRange(startAt: string, endAt: string): string;
  formatTimeRange(startAt: string, endAt: string): string;
}): ReactElement {
  const { t, sourceKind, sensitivity, status } = useI18n();
  const session = detail?.session ?? fallbackSession;

  if (error) {
    return <div className="error-banner inline">{error}</div>;
  }

  return (
    <div className="detail-stack">
      <div className="detail-header">
        <div>
          <p className="eyebrow">{t("activity.evidenceLayer")}</p>
          <h2>{session.title}</h2>
          <p>{formatDateTimeRange(session.startAt, session.endAt)}</p>
        </div>
        <div className="badge-row">
          <span className={`sensitivity ${session.privacy.sensitivity}`}>
            {sensitivity(session.privacy.sensitivity)}
          </span>
          <span className="runtime-pill">
            {session.localState.indexed ? t("activity.indexed") : t("activity.notIndexed")}
          </span>
        </div>
      </div>

      {isLoading ? <div className="empty-state compact">{t("activity.loadingDetail")}</div> : null}

      <dl className="detail-grid">
        <DetailField
          label={t("activity.timeWindow")}
          value={formatTimeRange(session.startAt, session.endAt)}
        />
        <DetailField
          label={t("activity.duration")}
          value={formatDuration(session.durationSeconds)}
        />
        <DetailField label={t("activity.eventCount")} value={`${session.eventCount}`} />
        <DetailField
          label={t("activity.sources")}
          value={session.sourceKinds.map(sourceKind).join(", ") || t("fallback.none")}
        />
        <DetailField
          label={t("activity.apps")}
          value={session.apps.join(", ") || t("fallback.unknownApp")}
        />
        <DetailField
          label={t("activity.project")}
          value={session.project ?? t("fallback.global")}
        />
        <DetailField label={t("activity.topic")} value={session.topic ?? t("fallback.none")} />
        <DetailField label={t("activity.retention")} value={session.privacy.retentionPolicyId} />
      </dl>

      <DetailBlock title={t("activity.summary")}>
        <p>{session.summary ?? t("fallback.noSummary")}</p>
      </DetailBlock>

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

      <DetailBlock title={t("activity.eventStream")}>
        {detail?.events.length ? (
          <div className="event-stream">
            {detail.events.map((event) => (
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
