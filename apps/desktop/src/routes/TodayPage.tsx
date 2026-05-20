import type { ReactElement } from "react";
import type { DesktopSnapshot } from "../orbitApi";
import { EvidenceList } from "../components/EvidenceList";
import { MetricCard } from "../components/MetricCard";
import { Section } from "../components/Section";
import { useI18n } from "../i18n";

export function TodayPage({ snapshot }: { snapshot: DesktopSnapshot }): ReactElement {
  const { t, sensitivity, impact } = useI18n();

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

      <Section title={t("section.recentActivity")}>
        <div className="item-list">
          {snapshot.today.activitySessions.map((session) => (
            <article className="list-item" key={session.id}>
              <div>
                <h3>{session.title}</h3>
                <p>{session.summary ?? t("fallback.noSummary")}</p>
                <div className="meta-line">
                  {session.startAt.slice(11, 16)} - {session.endAt.slice(11, 16)}
                  <span>
                    {session.eventCount} {t("unit.events")}
                  </span>
                  <span>{session.apps.join(", ")}</span>
                </div>
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

      <Section title={t("section.recommendations")}>
        <div className="item-list">
          {snapshot.today.recommendations.map((recommendation) => (
            <article className="list-item" key={recommendation.id}>
              <div>
                <h3>{recommendation.title}</h3>
                <p>{recommendation.explanation}</p>
                <div className="meta-line">
                  {recommendation.type}
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
