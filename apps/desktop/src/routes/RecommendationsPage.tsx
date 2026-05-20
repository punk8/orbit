import type { ReactElement } from "react";
import type { Recommendation } from "@orbit/core";
import type { RecommendationReviewAction } from "@orbit/db";
import { EvidenceList } from "../components/EvidenceList";
import { Section } from "../components/Section";
import { useI18n } from "../i18n";

export function RecommendationsPage({
  recommendations,
  onReviewRecommendation
}: {
  recommendations: Recommendation[];
  onReviewRecommendation(id: string, action: RecommendationReviewAction): Promise<void>;
}): ReactElement {
  const { t, status, impact, recommendationType } = useI18n();

  return (
    <div className="page-grid">
      <Section title={t("section.recommendations")}>
        <div className="item-list">
          {recommendations.map((recommendation) => (
            <article className="list-item vertical" key={recommendation.id}>
              <div className="item-heading">
                <h3>{recommendation.title}</h3>
                <span>{status(recommendation.status)}</span>
              </div>
              <p>{recommendation.explanation}</p>
              <div className="suggested-action">{recommendation.suggestedAction}</div>
              <div className="meta-line">
                {recommendationType(recommendation.type)}
                <span>{impact(recommendation.impact)}</span>
                <span>{Math.round(recommendation.confidence * 100)}%</span>
              </div>
              {recommendation.status === "new" || recommendation.status === "snoozed" ? (
                <div className="action-row">
                  <button
                    className="secondary-button"
                    onClick={() => void onReviewRecommendation(recommendation.id, "accept")}
                    type="button"
                  >
                    {t("action.accept")}
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => void onReviewRecommendation(recommendation.id, "dismiss")}
                    type="button"
                  >
                    {t("action.dismiss")}
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => void onReviewRecommendation(recommendation.id, "snooze")}
                    type="button"
                  >
                    {t("action.snooze")}
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => void onReviewRecommendation(recommendation.id, "resolve")}
                    type="button"
                  >
                    {t("action.resolve")}
                  </button>
                </div>
              ) : null}
              <EvidenceList evidence={recommendation.evidence} />
            </article>
          ))}
          {recommendations.length === 0 ? (
            <div className="empty-state">{t("empty.noRecommendations")}</div>
          ) : null}
        </div>
      </Section>
    </div>
  );
}
