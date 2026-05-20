import type { ReactElement } from "react";
import type { KnowledgeArtifact } from "@orbit/core";
import { EvidenceList } from "../components/EvidenceList";
import { Section } from "../components/Section";

export function KnowledgePage({ artifacts }: { artifacts: KnowledgeArtifact[] }): ReactElement {
  return (
    <Section title="Knowledge Artifacts">
      <div className="item-list">
        {artifacts.map((artifact) => (
          <article className="list-item vertical" key={artifact.id}>
            <div className="item-heading">
              <h3>{artifact.title}</h3>
              <span>{artifact.status}</span>
            </div>
            <p>{artifact.content.description}</p>
            <ul className="insight-list">
              {artifact.content.keyInsights.slice(0, 4).map((insight) => (
                <li key={insight}>{insight}</li>
              ))}
            </ul>
            <EvidenceList evidence={artifact.evidence} />
          </article>
        ))}
        {artifacts.length === 0 ? <div className="empty-state">No knowledge artifacts</div> : null}
      </div>
    </Section>
  );
}
