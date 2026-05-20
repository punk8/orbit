import type { ReactElement } from "react";
import type { ActivitySession } from "@orbit/core";
import { EvidenceList } from "../components/EvidenceList";
import { Section } from "../components/Section";
import { useI18n } from "../i18n";

export function ActivityPage({ sessions }: { sessions: ActivitySession[] }): ReactElement {
  const { t } = useI18n();

  return (
    <Section title={t("section.activityTimeline")}>
      <div className="timeline-list">
        {sessions.map((session) => (
          <article className="timeline-item" key={session.id}>
            <div className="timeline-rail" />
            <div className="timeline-body">
              <div className="item-heading">
                <h3>{session.title}</h3>
                <span>
                  {session.eventCount} {t("unit.events")}
                </span>
              </div>
              <p>{session.summary ?? t("fallback.noSummary")}</p>
              <div className="meta-line">
                {session.startAt} - {session.endAt}
                <span>{session.sourceKinds.join(", ")}</span>
                <span>{session.apps.join(", ") || t("fallback.unknownApp")}</span>
              </div>
              <EvidenceList evidence={session.evidence} />
            </div>
          </article>
        ))}
        {sessions.length === 0 ? (
          <div className="empty-state">{t("empty.noActivitySessions")}</div>
        ) : null}
      </div>
    </Section>
  );
}
