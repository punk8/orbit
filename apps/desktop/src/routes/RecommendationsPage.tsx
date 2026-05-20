import type { ReactElement } from "react";
import type { Recommendation } from "@orbit/core";
import { EvidenceList } from "../components/EvidenceList";
import { Section } from "../components/Section";

export function RecommendationsPage({
  recommendations
}: {
  recommendations: Recommendation[];
}): ReactElement {
  return (
    <Section title="Recommendations">
      <div className="item-list">
        {recommendations.map((recommendation) => (
          <article className="list-item vertical" key={recommendation.id}>
            <div className="item-heading">
              <h3>{recommendation.title}</h3>
              <span>{recommendation.status}</span>
            </div>
            <p>{recommendation.explanation}</p>
            <div className="suggested-action">{recommendation.suggestedAction}</div>
            <div className="meta-line">
              {recommendation.type}
              <span>{recommendation.impact}</span>
              <span>{Math.round(recommendation.confidence * 100)}%</span>
            </div>
            <EvidenceList evidence={recommendation.evidence} />
          </article>
        ))}
        {recommendations.length === 0 ? (
          <div className="empty-state">No recommendations</div>
        ) : null}
      </div>
    </Section>
  );
}
