import type { ReactElement } from "react";
import type { DesktopSnapshot } from "../orbitApi";
import { EvidenceList } from "../components/EvidenceList";
import { MetricCard } from "../components/MetricCard";
import { Section } from "../components/Section";

export function TodayPage({ snapshot }: { snapshot: DesktopSnapshot }): ReactElement {
  return (
    <div className="page-grid">
      <div className="metrics-row">
        <MetricCard label="Events" value={snapshot.counts.events} detail="normalized" />
        <MetricCard
          label="Activity"
          value={snapshot.today.activitySessions.length}
          detail="today"
        />
        <MetricCard
          label="Knowledge"
          value={snapshot.today.knowledgeArtifacts.length}
          detail="drafts"
        />
        <MetricCard
          label="Recommendations"
          value={snapshot.today.recommendations.length}
          detail="open"
        />
      </div>

      <Section title="Recent Activity">
        <div className="item-list">
          {snapshot.today.activitySessions.map((session) => (
            <article className="list-item" key={session.id}>
              <div>
                <h3>{session.title}</h3>
                <p>{session.summary ?? "No summary available"}</p>
                <div className="meta-line">
                  {session.startAt.slice(11, 16)} - {session.endAt.slice(11, 16)}
                  <span>{session.eventCount} events</span>
                  <span>{session.apps.join(", ")}</span>
                </div>
              </div>
              <span className={`sensitivity ${session.privacy.sensitivity}`}>
                {session.privacy.sensitivity}
              </span>
            </article>
          ))}
          {snapshot.today.activitySessions.length === 0 ? (
            <div className="empty-state">No activity for this date</div>
          ) : null}
        </div>
      </Section>

      <Section title="Recommendations">
        <div className="item-list">
          {snapshot.today.recommendations.map((recommendation) => (
            <article className="list-item" key={recommendation.id}>
              <div>
                <h3>{recommendation.title}</h3>
                <p>{recommendation.explanation}</p>
                <div className="meta-line">
                  {recommendation.type}
                  <span>{Math.round(recommendation.confidence * 100)}%</span>
                  <span>{recommendation.impact}</span>
                </div>
                <EvidenceList evidence={recommendation.evidence} />
              </div>
            </article>
          ))}
          {snapshot.today.recommendations.length === 0 ? (
            <div className="empty-state">No recommendations</div>
          ) : null}
        </div>
      </Section>
    </div>
  );
}
