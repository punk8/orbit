import { useState } from "react";
import type { ReactElement } from "react";
import type { ActivitySession, KnowledgeArtifact, Recommendation, SourceKind } from "@orbit/core";
import type { DesktopHandoffResult, DesktopPageId, DesktopSnapshot } from "../orbitApi";
import { EvidenceList } from "../components/EvidenceList";
import { MetricCard } from "../components/MetricCard";
import { Section } from "../components/Section";
import { useI18n } from "../i18n";
import type { TranslationKey } from "../i18n";

export function TodayPage({
  snapshot,
  onNavigate,
  onOpenActivitySession,
  onOpenKnowledgeArtifact,
  onOpenRecommendation,
  onCaptureScreenOcr,
  onGenerateTodayHandoff
}: {
  snapshot: DesktopSnapshot;
  onNavigate?(page: DesktopPageId): void;
  onOpenActivitySession?(sessionId: string): void;
  onOpenKnowledgeArtifact?(artifactId: string): void;
  onOpenRecommendation?(recommendationId: string): void;
  onCaptureScreenOcr?(): Promise<void>;
  onGenerateTodayHandoff?(): Promise<DesktopHandoffResult>;
}): ReactElement {
  const i18n = useI18n();
  const { t, sensitivity, sourceKind, status, impact, recommendationType, formatTimeRange } = i18n;
  const [isCapturingScreenOcr, setIsCapturingScreenOcr] = useState(false);
  const [isGeneratingTodayHandoff, setIsGeneratingTodayHandoff] = useState(false);
  const sourceStatus = buildSourceStatus(snapshot, {
    t,
    sourceKind
  });
  const nextActions = buildNextActions(snapshot, t);
  const dailyBrief = buildTodayDailyBrief(snapshot, t);
  const handoffReadiness = buildTodayHandoffReadiness(snapshot);
  const screenPolicy = snapshot.perception.sources.find((source) => source.sourceKind === "screen")
    ?.policy;

  return (
    <div className="page-grid">
      <div className="metrics-row">
        <MetricCard
          label={t("metric.events")}
          value={snapshot.counts.events}
          detail={t("detail.normalized")}
        />
        <MetricCard
          label={t("metric.activity")}
          value={snapshot.today.activitySessions.length}
          detail={t("detail.today")}
        />
        <MetricCard
          label={t("metric.knowledge")}
          value={snapshot.today.knowledgeArtifacts.length}
          detail={t("detail.drafts")}
        />
        <MetricCard
          label={t("metric.recommendations")}
          value={snapshot.today.recommendations.length}
          detail={t("detail.open")}
        />
      </div>

      <section className="today-daily-brief" aria-label={t("today.brief.title")}>
        <div className="today-daily-brief-heading">
          <div>
            <p className="eyebrow">daily brief</p>
            <h2>{t("today.brief.title")}</h2>
          </div>
          <span>{t("today.briefEvidenceBoundary")}</span>
        </div>
        <div className="today-daily-brief-grid">
          <TodayBriefColumn
            items={dailyBrief.completed}
            title={t("today.brief.completed")}
            emptyLabel={t("today.brief.emptyCompleted")}
            onOpenActivitySession={onOpenActivitySession}
            onOpenKnowledgeArtifact={onOpenKnowledgeArtifact}
            onOpenRecommendation={onOpenRecommendation}
          />
          <TodayBriefColumn
            items={dailyBrief.decisions}
            title={t("today.brief.decisions")}
            emptyLabel={t("today.brief.emptyDecisions")}
            onOpenActivitySession={onOpenActivitySession}
            onOpenKnowledgeArtifact={onOpenKnowledgeArtifact}
            onOpenRecommendation={onOpenRecommendation}
          />
          <TodayBriefColumn
            items={dailyBrief.risks}
            title={t("today.brief.risks")}
            emptyLabel={t("today.brief.emptyRisks")}
            onOpenActivitySession={onOpenActivitySession}
            onOpenKnowledgeArtifact={onOpenKnowledgeArtifact}
            onOpenRecommendation={onOpenRecommendation}
          />
          <TodayBriefColumn
            items={dailyBrief.followUps}
            title={t("today.brief.followUps")}
            emptyLabel={t("today.brief.emptyFollowUps")}
            onOpenActivitySession={onOpenActivitySession}
            onOpenKnowledgeArtifact={onOpenKnowledgeArtifact}
            onOpenRecommendation={onOpenRecommendation}
          />
        </div>
      </section>

      <section className="today-workbench" aria-label={t("today.workbench")}>
        <div className="today-source-status-panel">
          <div className="today-panel-heading">
            <p className="eyebrow">source status</p>
            <h2>{t("section.sourceStatus")}</h2>
          </div>
          <div className="today-source-status-grid">
            {sourceStatus.map((source) => (
              <article className="today-source-card" key={`${source.kind}:${source.label}`}>
                <div className="item-heading">
                  <h3>{source.label}</h3>
                  <span className={`runtime-pill ${source.state}`}>{source.stateLabel}</span>
                </div>
                <p>{source.description}</p>
                <div className="meta-line">
                  <span>{source.rawLabel}</span>
                  <span>{source.exportLabel}</span>
                  <span>{source.aiLabel}</span>
                </div>
              </article>
            ))}
            {sourceStatus.length === 0 ? (
              <div className="empty-state compact">{t("empty.noSources")}</div>
            ) : null}
          </div>
        </div>

        <div className="today-next-action-panel">
          <div className="today-panel-heading">
            <p className="eyebrow">next action</p>
            <h2>{t("today.nextActions")}</h2>
          </div>
          <div className="today-next-action-grid">
            {nextActions.map((action) => (
              <button
                className="today-next-action"
                key={action.id}
                onClick={() => onNavigate?.(action.page)}
                type="button"
              >
                <span>{action.label}</span>
                <strong>{action.value}</strong>
                <small>{action.description}</small>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="today-screen-ocr-strip" aria-label={t("today.screenOcrCaptureTitle")}>
        <div>
          <p className="eyebrow">real context</p>
          <h2>{t("today.screenOcrCaptureTitle")}</h2>
          <p>{t("today.screenOcrCaptureBoundary")}</p>
          <div className="meta-line">
            <span>
              {`${t("today.captureScreenOcrStatus")} ${tDogfoodRuntimeState(
                t,
                snapshot.perception.dogfoodRuntime.state
              )}`}
            </span>
            <span>{screenPolicy?.canStoreRaw ? t("source.rawStored") : t("source.rawNotStored")}</span>
            <span>{t("source.agentExportBlocked")}</span>
          </div>
        </div>
        <button
          className="secondary-button"
          disabled={!onCaptureScreenOcr || isCapturingScreenOcr}
          onClick={async () => {
            if (!onCaptureScreenOcr) return;
            setIsCapturingScreenOcr(true);
            try {
              await onCaptureScreenOcr();
            } finally {
              setIsCapturingScreenOcr(false);
            }
          }}
          type="button"
        >
          {isCapturingScreenOcr ? t("activity.capturingScreenOcr") : t("action.captureScreenOcr")}
        </button>
      </section>

      <section className="today-handoff-strip" aria-label={t("today.handoffStrip")}>
        <div>
          <p className="eyebrow">handoff</p>
          <h2>{t("nav.handoff")}</h2>
          <p>{t("today.handoffBoundary")}</p>
          <div className="today-handoff-readiness" aria-label={t("today.handoffReadiness")}>
            <span>
              {t("today.handoffIncluded")} <strong>{handoffReadiness.included}</strong>
            </span>
            <span>
              {t("today.handoffExcluded")} <strong>{handoffReadiness.excluded}</strong>
            </span>
            <span>
              {t("today.reviewBeforeHandoff")} <strong>{handoffReadiness.needsReview}</strong>
            </span>
          </div>
        </div>
        <div className="today-handoff-actions">
          <button
            className="primary-button"
            disabled={!onGenerateTodayHandoff || isGeneratingTodayHandoff}
            onClick={async () => {
              if (!onGenerateTodayHandoff) return;
              setIsGeneratingTodayHandoff(true);
              try {
                await onGenerateTodayHandoff();
              } finally {
                setIsGeneratingTodayHandoff(false);
              }
            }}
            type="button"
          >
            {isGeneratingTodayHandoff ? t("handoff.generating") : t("today.generateTodayHandoff")}
          </button>
          <button className="secondary-button" onClick={() => onNavigate?.("handoff")} type="button">
            {t("today.openHandoff")}
          </button>
        </div>
      </section>

      <Section title={t("section.recentActivity")}>
        <div className="item-list">
          {snapshot.today.activitySessions.map((session) => (
            <article className="list-item" key={session.id}>
              <div>
                <h3>{session.title}</h3>
                <p>{session.summary ?? t("fallback.noSummary")}</p>
                <div className="meta-line">
                  {formatTimeRange(session.startAt, session.endAt)}
                  <span>
                    {session.eventCount} {t("unit.events")}
                  </span>
                  <span>{session.apps.join(", ")}</span>
                  <span>{session.sourceKinds.map(sourceKind).join(", ")}</span>
                </div>
                <EvidenceList evidence={session.evidence} limit={3} />
              </div>
              <div className="list-item-actions">
                <span className={`sensitivity ${session.privacy.sensitivity}`}>
                  {sensitivity(session.privacy.sensitivity)}
                </span>
                <button
                  className="secondary-button compact-button"
                  data-today-action="open-activity-evidence"
                  onClick={() => onOpenActivitySession?.(session.id)}
                  type="button"
                >
                  {t("today.openActivityEvidence")}
                </button>
              </div>
            </article>
          ))}
          {snapshot.today.activitySessions.length === 0 ? (
            <div className="empty-state">{t("empty.noActivityForDate")}</div>
          ) : null}
        </div>
      </Section>

      <Section title={t("section.knowledgeDrafts")}>
        <div className="item-list">
          {snapshot.today.knowledgeArtifacts.map((artifact) => (
            <article className="list-item" key={artifact.id}>
              <div>
                <h3>{artifact.title}</h3>
                <p>{artifact.content.description}</p>
                <div className="meta-line">
                  <span>{status(artifact.status)}</span>
                  <span>{artifact.metadata.apps.join(", ") || t("fallback.unknownApp")}</span>
                  <span>
                    {artifact.metadata.sourceSessionIds.length} {t("knowledge.sourceSessionsShort")}
                  </span>
                </div>
                <EvidenceList evidence={artifact.evidence} limit={4} />
              </div>
              <div className="list-item-actions">
                <span className={`review-pill ${artifact.status}`}>{status(artifact.status)}</span>
                <button
                  className="secondary-button compact-button"
                  data-today-action="review-knowledge-draft"
                  onClick={() => onOpenKnowledgeArtifact?.(artifact.id)}
                  type="button"
                >
                  {t("today.reviewKnowledgeDraft")}
                </button>
              </div>
            </article>
          ))}
          {snapshot.today.knowledgeArtifacts.length === 0 ? (
            <div className="empty-state">{t("empty.noKnowledgeDrafts")}</div>
          ) : null}
        </div>
      </Section>

      <Section title={t("section.recommendations")}>
        <div className="item-list">
          {snapshot.today.recommendations.map((recommendation) => (
            <article className="list-item" key={recommendation.id}>
              <div>
                <h3>{recommendation.title}</h3>
                <p>{recommendation.explanation}</p>
                <div className="meta-line">
                  {recommendationType(recommendation.type)}
                  <span>{Math.round(recommendation.confidence * 100)}%</span>
                  <span>{impact(recommendation.impact)}</span>
                </div>
                <EvidenceList evidence={recommendation.evidence} />
              </div>
              <div className="list-item-actions">
                <span className={`review-pill ${recommendation.status}`}>
                  {status(recommendation.status)}
                </span>
                <button
                  className="secondary-button compact-button"
                  data-today-action="handle-recommendation"
                  onClick={() => onOpenRecommendation?.(recommendation.id)}
                  type="button"
                >
                  {t("today.handleRecommendation")}
                </button>
              </div>
            </article>
          ))}
          {snapshot.today.recommendations.length === 0 ? (
            <div className="empty-state">{t("empty.noRecommendations")}</div>
          ) : null}
        </div>
      </Section>
    </div>
  );
}

interface TodayDailyBrief {
  completed: TodayBriefItem[];
  decisions: TodayBriefItem[];
  risks: TodayBriefItem[];
  followUps: TodayBriefItem[];
}

interface TodayBriefItem {
  id: string;
  title: string;
  evidenceCount: number;
  sourceLabel: string;
  target: TodayBriefTarget;
}

type TodayBriefTarget =
  | { kind: "activity"; id: string }
  | { kind: "knowledge"; id: string }
  | { kind: "recommendation"; id: string };

function TodayBriefColumn({
  emptyLabel,
  items,
  onOpenActivitySession,
  onOpenKnowledgeArtifact,
  onOpenRecommendation,
  title
}: {
  emptyLabel: string;
  items: TodayBriefItem[];
  onOpenActivitySession?: ((sessionId: string) => void) | undefined;
  onOpenKnowledgeArtifact?: ((artifactId: string) => void) | undefined;
  onOpenRecommendation?: ((recommendationId: string) => void) | undefined;
  title: string;
}): ReactElement {
  const { t } = useI18n();
  return (
    <article className="today-brief-column">
      <div className="item-heading">
        <h3>{title}</h3>
        <span>{items.length}</span>
      </div>
      {items.length > 0 ? (
        <div className="today-brief-list">
          {items.map((item) => (
            <button
              className="today-brief-item"
              key={item.id}
              onClick={() =>
                openTodayBriefItem(item.target, {
                  onOpenActivitySession,
                  onOpenKnowledgeArtifact,
                  onOpenRecommendation
                })
              }
              type="button"
            >
              <span>{item.title}</span>
              <small>
                {item.sourceLabel} · {item.evidenceCount} {t("knowledge.evidenceCountLabel")}
              </small>
            </button>
          ))}
        </div>
      ) : (
        <p className="muted">{emptyLabel}</p>
      )}
    </article>
  );
}

function openTodayBriefItem(
  target: TodayBriefTarget,
  actions: {
    onOpenActivitySession?: ((sessionId: string) => void) | undefined;
    onOpenKnowledgeArtifact?: ((artifactId: string) => void) | undefined;
    onOpenRecommendation?: ((recommendationId: string) => void) | undefined;
  }
): void {
  if (target.kind === "activity") {
    actions.onOpenActivitySession?.(target.id);
  } else if (target.kind === "knowledge") {
    actions.onOpenKnowledgeArtifact?.(target.id);
  } else {
    actions.onOpenRecommendation?.(target.id);
  }
}

function buildTodayDailyBrief(
  snapshot: DesktopSnapshot,
  t: (key: TranslationKey) => string
): TodayDailyBrief {
  return {
    completed: snapshot.today.activitySessions
      .filter((session) => session.evidence.length > 0 || session.eventCount > 0)
      .map((session) => activityToBriefItem(session, t))
      .slice(0, 4),
    decisions: collectConfirmedKnowledgeItems(snapshot.today.knowledgeArtifacts, "decisions", t),
    risks: [
      ...collectConfirmedKnowledgeItems(snapshot.today.knowledgeArtifacts, "blockers", t),
      ...collectOpenRecommendationItems(snapshot.today.recommendations, ["risk", "blocker"], t)
    ].slice(0, 4),
    followUps: [
      ...snapshot.today.knowledgeArtifacts
        .filter((artifact) => artifact.status === "confirmed")
        .flatMap((artifact) => knowledgeFollowUpsToBriefItems(artifact, t)),
      ...collectOpenRecommendationItems(snapshot.today.recommendations, ["follow_up", "context_needed"], t)
    ].slice(0, 4)
  };
}

function activityToBriefItem(
  session: ActivitySession,
  t: (key: TranslationKey) => string
): TodayBriefItem {
  return {
    id: `activity:${session.id}`,
    title: session.title || session.summary || t("fallback.noSummary"),
    evidenceCount: session.evidence.length,
    sourceLabel: t("today.brief.sourceActivity"),
    target: { kind: "activity", id: session.id }
  };
}

function collectConfirmedKnowledgeItems(
  artifacts: KnowledgeArtifact[],
  field: "decisions" | "blockers",
  t: (key: TranslationKey) => string
): TodayBriefItem[] {
  return artifacts
    .filter((artifact) => artifact.status === "confirmed")
    .flatMap((artifact) =>
      (artifact.content[field] ?? []).map((item, index) => ({
        id: `knowledge:${artifact.id}:${field}:${index}`,
        title: item,
        evidenceCount: artifact.evidence.length,
        sourceLabel: t("today.brief.sourceKnowledge"),
        target: { kind: "knowledge" as const, id: artifact.id }
      }))
    )
    .slice(0, 4);
}

function knowledgeFollowUpsToBriefItems(
  artifact: KnowledgeArtifact,
  t: (key: TranslationKey) => string
): TodayBriefItem[] {
  return (artifact.content.followUps ?? [])
    .filter((followUp) => followUp.status === "open")
    .map((followUp) => ({
      id: `knowledge:${artifact.id}:followup:${followUp.id}`,
      title: followUp.title,
      evidenceCount: followUp.evidence.length || artifact.evidence.length,
      sourceLabel: t("today.brief.sourceKnowledge"),
      target: { kind: "knowledge" as const, id: artifact.id }
    }));
}

function collectOpenRecommendationItems(
  recommendations: Recommendation[],
  types: Recommendation["type"][],
  t: (key: TranslationKey) => string
): TodayBriefItem[] {
  const typeSet = new Set(types);
  return recommendations
    .filter((recommendation) => isOpenRecommendation(recommendation))
    .filter((recommendation) => typeSet.has(recommendation.type))
    .map((recommendation) => ({
      id: `recommendation:${recommendation.id}`,
      title: recommendation.title,
      evidenceCount: recommendation.evidence.length,
      sourceLabel: t("today.brief.sourceRecommendation"),
      target: { kind: "recommendation" as const, id: recommendation.id }
    }))
    .slice(0, 4);
}

function isOpenRecommendation(recommendation: Recommendation): boolean {
  if (recommendation.status === "dismissed" || recommendation.status === "resolved") return false;
  if (recommendation.status !== "snoozed") return true;
  if (!recommendation.dueAt) return true;
  return recommendation.dueAt <= new Date().toISOString();
}

interface TodaySourceStatus {
  kind: SourceKind;
  label: string;
  state: "ready" | "paused" | "blocked";
  stateLabel: string;
  description: string;
  rawLabel: string;
  exportLabel: string;
  aiLabel: string;
}

interface TodayNextAction {
  id: string;
  page: DesktopPageId;
  label: string;
  value: string;
  description: string;
}

interface TodayHandoffReadiness {
  included: number;
  excluded: number;
  needsReview: number;
}

function buildSourceStatus(
  snapshot: DesktopSnapshot,
  labels: {
    t(key: TranslationKey): string;
    sourceKind(value: string): string;
  }
): TodaySourceStatus[] {
  const { t, sourceKind } = labels;
  return snapshot.sources.slice(0, 6).map((source) => {
    const config = snapshot.sourceAdapterConfigs[source.id];
    const importOnly = config?.mode === "import_only";
    const state =
      source.enabled && !source.paused && !source.lastError
        ? "ready"
        : source.paused
          ? "paused"
          : "blocked";
    return {
      kind: source.kind,
      label: source.displayName || sourceKind(source.kind),
      state,
      stateLabel:
        importOnly
          ? t("source.importOnly")
          : state === "ready"
          ? t("today.sourceReady")
          : state === "paused"
            ? t("today.sourcePaused")
            : t("today.sourceBlocked"),
      description:
        (importOnly && config?.lastImport
          ? `${t("source.lastImport")} ${config.lastImport.importedAt}`
          : undefined) ??
        source.lastError ??
        source.lastEventAt ??
        source.updatedAt,
      rawLabel: source.permissionScope.canStoreRaw
        ? t("source.rawStored")
        : t("source.rawNotStored"),
      exportLabel: source.permissionScope.canExportToAgent
        ? t("source.agentExportAllowed")
        : t("source.agentExportBlocked"),
      aiLabel: source.permissionScope.canUseForAI ? t("source.aiAllowed") : t("source.aiBlocked")
    };
  });
}

function buildNextActions(
  snapshot: DesktopSnapshot,
  t: (key: TranslationKey) => string
): TodayNextAction[] {
  const knowledgeDrafts = snapshot.knowledgeArtifacts.filter(
    (artifact) => artifact.status === "draft"
  );
  const memoryCandidates = snapshot.memories.filter((memory) => memory.status === "needs_review");
  const openRecommendations = snapshot.recommendations.filter((recommendation) =>
    ["new", "accepted", "snoozed"].includes(recommendation.status)
  );
  return [
    {
      id: "activity",
      page: "activity",
      label: t("nav.activity"),
      value: String(snapshot.today.activitySessions.length),
      description: t("today.nextActionActivity")
    },
    {
      id: "review",
      page: "review",
      label: t("nav.review"),
      value: String(knowledgeDrafts.length + memoryCandidates.length),
      description: t("today.nextActionReview")
    },
    {
      id: "recommendations",
      page: "recommendations",
      label: t("nav.recommendations"),
      value: String(openRecommendations.length),
      description: t("today.nextActionRecommendations")
    },
    {
      id: "handoff",
      page: "handoff",
      label: t("nav.handoff"),
      value: String(snapshot.today.activitySessions.length + snapshot.today.knowledgeArtifacts.length),
      description: t("today.nextActionHandoff")
    }
  ];
}

function buildTodayHandoffReadiness(snapshot: DesktopSnapshot): TodayHandoffReadiness {
  const confirmedKnowledge = snapshot.today.knowledgeArtifacts.filter(
    (artifact) => artifact.status === "confirmed"
  ).length;
  const draftKnowledge = snapshot.today.knowledgeArtifacts.filter(
    (artifact) => artifact.status !== "confirmed"
  ).length;
  const confirmedMemories = snapshot.today.memories.filter(
    (memory) => memory.status === "confirmed"
  ).length;
  const unconfirmedMemories = snapshot.today.memories.filter(
    (memory) => memory.status !== "confirmed"
  ).length;
  const openRecommendations = snapshot.today.recommendations.filter((recommendation) =>
    ["new", "accepted", "snoozed"].includes(recommendation.status)
  ).length;
  const closedRecommendations = snapshot.today.recommendations.length - openRecommendations;
  return {
    included:
      snapshot.today.activitySessions.length +
      confirmedKnowledge +
      confirmedMemories +
      openRecommendations,
    excluded: draftKnowledge + unconfirmedMemories + closedRecommendations,
    needsReview: draftKnowledge + unconfirmedMemories
  };
}

function tDogfoodRuntimeState(
  t: (key: TranslationKey) => string,
  state: DesktopSnapshot["perception"]["dogfoodRuntime"]["state"]
): string {
  return t(`dogfoodRuntime.${state}` as TranslationKey);
}
