import type { ReactElement } from "react";
import type { Recommendation } from "@orbit/core";
import type { RecommendationReviewAction } from "@orbit/db";
import { EvidenceList } from "../components/EvidenceList";
import { Section } from "../components/Section";

export function RecommendationsPage({
  recommendations,
  onReviewRecommendation
}: {
  recommendations: Recommendation[];
  onReviewRecommendation(id: string, action: RecommendationReviewAction): Promise<void>;
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
            {recommendation.status === "new" || recommendation.status === "snoozed" ? (
              <div className="action-row">
                <button
                  className="secondary-button"
                  onClick={() => void onReviewRecommendation(recommendation.id, "accept")}
                  type="button"
                >
                  Accept
                </button>
                <button
                  className="secondary-button"
                  onClick={() => void onReviewRecommendation(recommendation.id, "dismiss")}
                  type="button"
                >
                  Dismiss
                </button>
                <button
                  className="secondary-button"
                  onClick={() => void onReviewRecommendation(recommendation.id, "snooze")}
                  type="button"
                >
                  Snooze
                </button>
                <button
                  className="secondary-button"
                  onClick={() => void onReviewRecommendation(recommendation.id, "resolve")}
                  type="button"
                >
                  Resolve
                </button>
              </div>
            ) : null}
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
