import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import type { Recommendation, RecommendationType } from "@orbit/core";
import type { RecommendationReviewAction } from "@orbit/db";
import type { DesktopRecommendationDetail } from "../orbitApi";
import { EvidenceList } from "../components/EvidenceList";
import { Section } from "../components/Section";
import { useI18n } from "../i18n";

interface RecommendationsPageProps {
  recommendations: Recommendation[];
  focusRecommendationId?: string | undefined;
  onFocusConsumed(): void;
  onReviewRecommendation(
    id: string,
    action: RecommendationReviewAction,
    options?: { snoozeUntil?: string | undefined }
  ): Promise<void>;
}

interface RecommendationFilters {
  status: string;
  type: string;
  impact: string;
  sideEffectLevel: string;
  query: string;
  queue: "active" | "snoozed" | "closed" | "all";
}

const defaultFilters: RecommendationFilters = {
  status: "",
  type: "",
  impact: "",
  sideEffectLevel: "",
  query: "",
  queue: "active"
};

export function RecommendationsPage({
  focusRecommendationId,
  recommendations,
  onFocusConsumed,
  onReviewRecommendation
}: RecommendationsPageProps): ReactElement {
  const { t, status, impact, recommendationType } = useI18n();
  const [filters, setFilters] = useState<RecommendationFilters>(defaultFilters);
  const [selectedId, setSelectedId] = useState<string | undefined>(recommendations[0]?.id);
  const [detail, setDetail] = useState<DesktopRecommendationDetail | undefined>();
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [snoozeDate, setSnoozeDate] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);
  const [latestTodayFocus, setLatestTodayFocus] = useState(false);

  const filterOptions = useMemo(() => buildFilterOptions(recommendations), [recommendations]);
  const filteredRecommendations = useMemo(
    () => recommendations.filter((recommendation) => matchesFilters(recommendation, filters)),
    [filters, recommendations]
  );
  const selectedRecommendation = filteredRecommendations.find(
    (recommendation) => recommendation.id === selectedId
  );
  const activeRecommendation = detail?.recommendation ?? selectedRecommendation;

  useEffect(() => {
    if (!focusRecommendationId) return;
    if (!recommendations.some((recommendation) => recommendation.id === focusRecommendationId)) {
      onFocusConsumed();
      return;
    }
    setFilters(defaultFilters);
    setSelectedId(focusRecommendationId);
    setLatestTodayFocus(true);
    onFocusConsumed();
  }, [focusRecommendationId, onFocusConsumed, recommendations]);

  useEffect(() => {
    if (focusRecommendationId) return;
    if (filteredRecommendations.some((recommendation) => recommendation.id === selectedId)) return;
    setSelectedId(filteredRecommendations[0]?.id);
  }, [filteredRecommendations, focusRecommendationId, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(undefined);
      setSnoozeDate("");
      return;
    }

    let cancelled = false;
    setIsLoadingDetail(true);
    setError(undefined);
    void window.orbit
      .getRecommendationDetail(selectedId)
      .then((nextDetail) => {
        if (!cancelled) {
          setDetail(nextDetail);
          setSnoozeDate(toDateInputValue(nextDetail.recommendation.dueAt));
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setDetail(undefined);
          setError(reason instanceof Error ? reason.message : t("error.recommendationDetail"));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingDetail(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId, refreshToken, t]);

  async function reviewRecommendation(
    recommendation: Recommendation,
    action: RecommendationReviewAction
  ): Promise<void> {
    if (action === "accept" && !window.confirm(t("confirm.acceptRecommendation"))) {
      return;
    }
    if (action === "dismiss" && !window.confirm(t("confirm.dismissRecommendation"))) {
      return;
    }
    const options =
      action === "snooze" && snoozeDate
        ? { snoozeUntil: `${snoozeDate}T09:00:00.000Z` }
        : undefined;
    await onReviewRecommendation(recommendation.id, action, options);
    setRefreshToken((current) => current + 1);
  }

  return (
    <div className="page-grid">
      <Section title={t("section.recommendations")}>
        <div className="filter-bar recommendation-filter-bar">
          <div className="segmented-control" aria-label={t("recommendation.queue")}>
            {(["active", "snoozed", "closed", "all"] as RecommendationFilters["queue"][]).map(
              (queue) => (
                <button
                  className={filters.queue === queue ? "active" : ""}
                  key={queue}
                  onClick={() => setFilters((current) => ({ ...current, queue }))}
                  type="button"
                >
                  {recommendationQueueLabel(queue, t)}
                </button>
              )
            )}
          </div>
          <label className="filter-search">
            <span>{t("filter.search")}</span>
            <input
              className="text-input"
              value={filters.query}
              onChange={(event) =>
                setFilters((current) => ({ ...current, query: event.target.value }))
              }
              placeholder={t("recommendation.searchPlaceholder")}
              type="search"
            />
          </label>
          <label>
            <span>{t("filter.status")}</span>
            <select
              className="select-input compact-input"
              value={filters.status}
              onChange={(event) =>
                setFilters((current) => ({ ...current, status: event.target.value }))
              }
            >
              <option value="">{t("filter.allStatuses")}</option>
              {filterOptions.statuses.map((value) => (
                <option key={value} value={value}>
                  {status(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("filter.type")}</span>
            <select
              className="select-input compact-input"
              value={filters.type}
              onChange={(event) =>
                setFilters((current) => ({ ...current, type: event.target.value }))
              }
            >
              <option value="">{t("filter.allTypes")}</option>
              {filterOptions.types.map((value) => (
                <option key={value} value={value}>
                  {recommendationType(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("filter.impact")}</span>
            <select
              className="select-input compact-input"
              value={filters.impact}
              onChange={(event) =>
                setFilters((current) => ({ ...current, impact: event.target.value }))
              }
            >
              <option value="">{t("filter.allImpact")}</option>
              {filterOptions.impacts.map((value) => (
                <option key={value} value={value}>
                  {impact(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("recommendation.sideEffectLevel")}</span>
            <select
              className="select-input compact-input"
              value={filters.sideEffectLevel}
              onChange={(event) =>
                setFilters((current) => ({ ...current, sideEffectLevel: event.target.value }))
              }
            >
              <option value="">{t("filter.allLevels")}</option>
              <option value="0">{t("recommendation.level0")}</option>
              <option value="1">{t("recommendation.level1")}</option>
              <option value="2">{t("recommendation.level2")}</option>
              <option value="3">{t("recommendation.level3")}</option>
            </select>
          </label>
        </div>

        {error ? <div className="error-banner inline">{error}</div> : null}
        {latestTodayFocus ? (
          <div className="notice-banner inline">{t("recommendation.latestTodayFocused")}</div>
        ) : null}

        <div className="recommendation-workbench">
          <div className="recommendation-list" aria-label={t("recommendation.recommendationList")}>
            {filteredRecommendations.map((recommendation) => (
              <button
                className={`recommendation-list-item ${
                  selectedId === recommendation.id ? "active" : ""
                }`}
                key={recommendation.id}
                onClick={() => setSelectedId(recommendation.id)}
                type="button"
              >
                <div className="item-heading">
                  <h3>{recommendation.title}</h3>
                  <span>{status(recommendation.status)}</span>
                </div>
                <p>{recommendation.explanation}</p>
                <div className="suggested-action">{recommendation.suggestedAction}</div>
                <div className="meta-line">
                  <span>{recommendationType(recommendation.type)}</span>
                  <span>{impact(recommendation.impact)}</span>
                  <span>
                    {formatConfidence(recommendation.confidence, t("recommendation.confidence"))}
                  </span>
                  <span>{formatSideEffectLevel(recommendation, t)}</span>
                </div>
                <div className="meta-line">
                  <span>
                    {recommendation.evidence.length} {t("recommendation.evidenceCountLabel")}
                  </span>
                  <span>{recommendation.dueAt ?? t("fallback.none")}</span>
                </div>
              </button>
            ))}
            {filteredRecommendations.length === 0 ? (
              <div className="empty-state">{t("empty.noRecommendations")}</div>
            ) : null}
          </div>

          <div className="recommendation-detail-pane">
            {activeRecommendation ? (
              <RecommendationDetail
                detail={detail}
                isLoading={isLoadingDetail}
                onReview={(action) => void reviewRecommendation(activeRecommendation, action)}
                recommendation={activeRecommendation}
                snoozeDate={snoozeDate}
                onSnoozeDateChange={setSnoozeDate}
              />
            ) : (
              <div className="empty-state">{t("empty.noRecommendations")}</div>
            )}
          </div>
        </div>
      </Section>
    </div>
  );
}

function RecommendationDetail({
  detail,
  isLoading,
  onReview,
  onSnoozeDateChange,
  recommendation,
  snoozeDate
}: {
  detail: DesktopRecommendationDetail | undefined;
  isLoading: boolean;
  onReview(action: RecommendationReviewAction): void;
  onSnoozeDateChange(value: string): void;
  recommendation: Recommendation;
  snoozeDate: string;
}): ReactElement {
  const { t, status, impact, recommendationType, formatDateTimeRange } = useI18n();
  const sideEffect = getSideEffectPolicy(recommendation);
  const isActionable = recommendation.status === "new" || recommendation.status === "snoozed";

  return (
    <div className="detail-stack">
      <div className="detail-header">
        <div>
          <p className="eyebrow">{t("recommendation.explanationLayer")}</p>
          <h2>{recommendation.title}</h2>
          <p>
            {recommendationType(recommendation.type)} · {status(recommendation.status)} ·{" "}
            {impact(recommendation.impact)}
          </p>
        </div>
        <div className="action-row">
          <button
            className="secondary-button"
            disabled={!isActionable}
            onClick={() => onReview("accept")}
            type="button"
          >
            {t("action.accept")}
          </button>
          <button
            className="secondary-button"
            disabled={!isActionable}
            onClick={() => onReview("dismiss")}
            type="button"
          >
            {t("action.dismiss")}
          </button>
          <button
            className="secondary-button"
            disabled={recommendation.status === "resolved"}
            onClick={() => onReview("resolve")}
            type="button"
          >
            {t("action.resolve")}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="empty-state compact">{t("recommendation.loadingDetail")}</div>
      ) : null}

      <dl className="detail-grid">
        <DetailField
          label={t("recommendation.type")}
          value={recommendationType(recommendation.type)}
        />
        <DetailField label={t("recommendation.status")} value={status(recommendation.status)} />
        <DetailField
          label={t("recommendation.confidence")}
          value={formatConfidence(recommendation.confidence, t("recommendation.confidence"))}
        />
        <DetailField label={t("recommendation.impact")} value={impact(recommendation.impact)} />
        <DetailField
          label={t("recommendation.createdAt")}
          value={formatDateTime(recommendation.createdAt)}
        />
        <DetailField
          label={t("recommendation.dueAt")}
          value={recommendation.dueAt ?? t("fallback.none")}
        />
        <DetailField
          label={t("recommendation.sideEffectLevel")}
          value={formatSideEffectLevel(recommendation, t)}
        />
        <DetailField
          label={t("recommendation.evidenceCount")}
          value={`${recommendation.evidence.length}`}
        />
      </dl>

      <DetailBlock title={t("recommendation.whyNow")}>
        <p>{recommendation.explanation}</p>
      </DetailBlock>

      <DetailBlock title={t("recommendation.suggestedAction")}>
        <p>{recommendation.suggestedAction}</p>
      </DetailBlock>

      <DetailBlock title={t("recommendation.snoozeUntil")}>
        <div className="snooze-control">
          <input
            className="text-input compact-input"
            type="date"
            value={snoozeDate}
            onChange={(event) => onSnoozeDateChange(event.target.value)}
          />
          <button className="secondary-button" onClick={() => onReview("snooze")} type="button">
            {t("action.snooze")}
          </button>
        </div>
      </DetailBlock>

      <DetailBlock title={t("recommendation.evidence")}>
        <EvidenceList evidence={recommendation.evidence} limit={12} />
      </DetailBlock>

      <div className="detail-columns">
        <DetailBlock title={t("recommendation.confidenceExplanation")}>
          <p>{buildConfidenceExplanation(recommendation, t)}</p>
        </DetailBlock>
        <DetailBlock title={t("recommendation.sideEffectPolicy")}>
          <p>{sideEffectDescription(sideEffect.level, t)}</p>
        </DetailBlock>
      </div>

      <DetailBlock title={t("recommendation.impactScope")}>
        <div className="meta-line">
          <span>{recommendation.impact}</span>
          <span>{recommendation.type}</span>
          <span>
            {detail?.sourceSessions.length ?? 0} {t("recommendation.sourceSessions")}
          </span>
          <span>
            {detail?.events.length ?? 0} {t("recommendation.events")}
          </span>
        </div>
      </DetailBlock>

      <div className="detail-columns">
        <DetailBlock title={t("recommendation.sourceEvents")}>
          {detail?.events.length ? (
            <div className="event-stream">
              {detail.events.map((event) => (
                <article className="event-row compact-event-row" key={event.id}>
                  <div className="event-row-time">{formatDateTime(event.occurredAt)}</div>
                  <div>
                    <h3>{event.content.title ?? event.content.summary ?? event.source.pointer}</h3>
                    <p>{event.content.summary ?? event.content.text ?? t("fallback.noSummary")}</p>
                    <div className="meta-line">
                      <span>{event.type}</span>
                      <code>{event.source.pointer}</code>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">{t("fallback.none")}</p>
          )}
        </DetailBlock>
        <DetailBlock title={t("recommendation.sourceSessions")}>
          {detail?.sourceSessions.length ? (
            <div className="linked-object-list">
              {detail.sourceSessions.map((session) => (
                <article key={session.id}>
                  <h4>{session.title}</h4>
                  <p>{formatDateTimeRange(session.startAt, session.endAt)}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">{t("fallback.none")}</p>
          )}
        </DetailBlock>
      </div>

      <div className="detail-columns">
        <DetailBlock title={t("recommendation.relatedKnowledge")}>
          {detail?.knowledgeArtifacts.length ? (
            <div className="linked-object-list">
              {detail.knowledgeArtifacts.map((artifact) => (
                <article key={artifact.id}>
                  <h4>{artifact.title}</h4>
                  <p>
                    {artifact.type} · {artifact.status}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">{t("fallback.none")}</p>
          )}
        </DetailBlock>
        <DetailBlock title={t("recommendation.relatedMemories")}>
          {detail?.memories.length ? (
            <div className="linked-object-list">
              {detail.memories.map((memory) => (
                <article key={memory.id}>
                  <h4>{memory.title}</h4>
                  <p>
                    {memory.kind} · {memory.status}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">{t("fallback.none")}</p>
          )}
        </DetailBlock>
      </div>

      <DetailBlock title={t("recommendation.handoffImpact")}>
        <p>{handoffImpact(recommendation, t)}</p>
      </DetailBlock>

      <DetailBlock title={t("recommendation.noExternalSideEffects")}>
        <p>{t("recommendation.acceptPolicy")}</p>
        <p>{t("recommendation.acceptRecordsOnly")}</p>
      </DetailBlock>
    </div>
  );
}

function DetailBlock({
  title,
  children
}: {
  title: string;
  children: ReactElement | ReactElement[];
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

function buildFilterOptions(recommendations: Recommendation[]): {
  statuses: string[];
  types: RecommendationType[];
  impacts: Recommendation["impact"][];
} {
  return {
    statuses: sortedUnique(recommendations.map((recommendation) => recommendation.status)),
    types: sortedUnique(recommendations.map((recommendation) => recommendation.type)),
    impacts: sortedUnique(recommendations.map((recommendation) => recommendation.impact))
  };
}

function matchesFilters(recommendation: Recommendation, filters: RecommendationFilters): boolean {
  if (!isRecommendationVisibleInQueue(recommendation, filters.queue)) return false;
  if (filters.status && recommendation.status !== filters.status) return false;
  if (filters.type && recommendation.type !== filters.type) return false;
  if (filters.impact && recommendation.impact !== filters.impact) return false;
  if (
    filters.sideEffectLevel &&
    `${getSideEffectPolicy(recommendation).level}` !== filters.sideEffectLevel
  ) {
    return false;
  }
  const query = filters.query.trim().toLowerCase();
  if (!query) return true;
  return [
    recommendation.title,
    recommendation.explanation,
    recommendation.suggestedAction,
    recommendation.type,
    recommendation.status,
    recommendation.evidence.map((ref) => `${ref.sourcePointer} ${ref.excerpt ?? ""}`).join(" ")
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function isRecommendationVisibleInQueue(
  recommendation: Recommendation,
  queue: RecommendationFilters["queue"]
): boolean {
  if (queue === "all") return true;
  if (queue === "snoozed") return recommendation.status === "snoozed";
  if (queue === "closed") {
    return recommendation.status === "dismissed" || recommendation.status === "resolved";
  }
  if (recommendation.status === "dismissed" || recommendation.status === "resolved") return false;
  if (recommendation.status !== "snoozed") return true;
  if (!recommendation.dueAt) return true;
  return recommendation.dueAt <= new Date().toISOString();
}

function recommendationQueueLabel(
  queue: RecommendationFilters["queue"],
  t: ReturnType<typeof useI18n>["t"]
): string {
  if (queue === "active") return t("recommendation.queue.active");
  if (queue === "snoozed") return t("recommendation.queue.snoozed");
  if (queue === "closed") return t("recommendation.queue.closed");
  return t("recommendation.queue.all");
}

function getSideEffectPolicy(recommendation: Recommendation): {
  level: 0 | 1 | 2 | 3;
} {
  if (recommendation.type === "automation_opportunity") {
    return {
      level: 1
    };
  }
  return {
    level: 0
  };
}

function formatSideEffectLevel(
  recommendation: Recommendation,
  t: ReturnType<typeof useI18n>["t"]
): string {
  const policy = getSideEffectPolicy(recommendation);
  if (policy.level === 0) return t("recommendation.level0");
  if (policy.level === 1) return t("recommendation.level1");
  if (policy.level === 2) return t("recommendation.level2");
  return t("recommendation.level3");
}

function sideEffectDescription(level: number, t: ReturnType<typeof useI18n>["t"]): string {
  if (level === 0) return t("recommendation.level0Description");
  if (level === 1) return t("recommendation.level1Description");
  if (level === 2) return t("recommendation.level2Description");
  return t("recommendation.level3Description");
}

function buildConfidenceExplanation(
  recommendation: Recommendation,
  t: ReturnType<typeof useI18n>["t"]
): string {
  return `${t("recommendation.confidenceRulePrefix")} ${recommendation.evidence.length} ${t(
    "recommendation.evidenceCountLabel"
  )}; ${t("recommendation.confidenceValuePrefix")} ${Math.round(
    recommendation.confidence * 100
  )}%.`;
}

function handoffImpact(recommendation: Recommendation, t: ReturnType<typeof useI18n>["t"]): string {
  if (recommendation.status === "new" || recommendation.status === "accepted") {
    return t("recommendation.handoffIncluded");
  }
  return t("recommendation.handoffExcluded");
}

function toDateInputValue(value: string | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function formatConfidence(confidence: number, label: string): string {
  return `${label} ${Math.round(confidence * 100)}%`;
}

function sortedUnique<T extends string>(values: Array<T | undefined>): T[] {
  return Array.from(new Set(values.filter(Boolean) as T[])).sort((a, b) => a.localeCompare(b));
}
