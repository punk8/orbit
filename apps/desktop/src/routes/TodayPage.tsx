import type { ReactElement } from "react";
import type { SourceKind } from "@orbit/core";
import type { DesktopPageId, DesktopSnapshot } from "../orbitApi";
import { EvidenceList } from "../components/EvidenceList";
import { MetricCard } from "../components/MetricCard";
import { Section } from "../components/Section";
import { useI18n } from "../i18n";
import type { TranslationKey } from "../i18n";

export function TodayPage({
  snapshot,
  onNavigate
}: {
  snapshot: DesktopSnapshot;
  onNavigate?(page: DesktopPageId): void;
}): ReactElement {
  const i18n = useI18n();
  const { t, sensitivity, sourceKind, status, impact, recommendationType, formatTimeRange } = i18n;
  const sourceStatus = buildSourceStatus(snapshot, {
    t,
    sourceKind
  });
  const nextActions = buildNextActions(snapshot, t);

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

      <section className="today-handoff-strip" aria-label={t("today.handoffStrip")}>
        <div>
          <p className="eyebrow">handoff</p>
          <h2>{t("nav.handoff")}</h2>
          <p>{t("today.handoffBoundary")}</p>
        </div>
        <button className="secondary-button" onClick={() => onNavigate?.("handoff")} type="button">
          {t("today.openHandoff")}
        </button>
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
              <span className={`sensitivity ${session.privacy.sensitivity}`}>
                {sensitivity(session.privacy.sensitivity)}
              </span>
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
