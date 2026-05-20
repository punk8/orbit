import type { ReactElement } from "react";
import type { DesktopSnapshot } from "../orbitApi";
import { MetricCard } from "../components/MetricCard";
import { Section } from "../components/Section";

export function SourcesPage({ snapshot }: { snapshot: DesktopSnapshot }): ReactElement {
  return (
    <div className="page-grid">
      <div className="metrics-row">
        <MetricCard label="Sources" value={snapshot.counts.sources} />
        <MetricCard label="Events" value={snapshot.counts.events} />
        <MetricCard label="Local DB" value="SQLite" detail="WAL enabled" />
      </div>
      <Section title="Source Status">
        <div className="item-list">
          {snapshot.sources.map((source) => (
            <article className="list-item" key={source.id}>
              <div>
                <h3>{source.displayName}</h3>
                <div className="meta-line">
                  {source.kind}
                  <span>{source.defaultSensitivity}</span>
                  <span>{source.enabled ? "enabled" : "disabled"}</span>
                </div>
              </div>
            </article>
          ))}
          {snapshot.sources.length === 0 ? (
            <div className="empty-state">No sources configured</div>
          ) : null}
        </div>
      </Section>
    </div>
  );
}
