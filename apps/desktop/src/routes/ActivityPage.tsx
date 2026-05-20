import type { ReactElement } from "react";
import type { ActivitySession } from "@orbit/core";
import { EvidenceList } from "../components/EvidenceList";
import { Section } from "../components/Section";

export function ActivityPage({ sessions }: { sessions: ActivitySession[] }): ReactElement {
  return (
    <Section title="Activity Timeline">
      <div className="timeline-list">
        {sessions.map((session) => (
          <article className="timeline-item" key={session.id}>
            <div className="timeline-rail" />
            <div className="timeline-body">
              <div className="item-heading">
                <h3>{session.title}</h3>
                <span>{session.eventCount} events</span>
              </div>
              <p>{session.summary ?? "No summary available"}</p>
              <div className="meta-line">
                {session.startAt} - {session.endAt}
                <span>{session.sourceKinds.join(", ")}</span>
                <span>{session.apps.join(", ") || "unknown app"}</span>
              </div>
              <EvidenceList evidence={session.evidence} />
            </div>
          </article>
        ))}
        {sessions.length === 0 ? <div className="empty-state">No activity sessions</div> : null}
      </div>
    </Section>
  );
}
