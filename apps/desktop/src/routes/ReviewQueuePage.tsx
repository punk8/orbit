import { useState } from "react";
import type { ReactElement } from "react";
import type { DesktopSnapshot } from "../orbitApi";
import type { KnowledgeReviewAction, MemoryReviewAction } from "@orbit/db";
import { EvidenceList } from "../components/EvidenceList";
import { Section } from "../components/Section";
import { useI18n } from "../i18n";

export function ReviewQueuePage({
  snapshot,
  onOpenKnowledge,
  onReviewKnowledge,
  onReviewMemory
}: {
  snapshot: DesktopSnapshot;
  onOpenKnowledge(id: string): void;
  onReviewKnowledge(id: string, action: KnowledgeReviewAction): Promise<void>;
  onReviewMemory(id: string, action: MemoryReviewAction): Promise<void>;
}): ReactElement {
  const { t, status, sensitivity } = useI18n();
  const [expandedEvidenceIds, setExpandedEvidenceIds] = useState<Set<string>>(new Set());
  const knowledgeDrafts = snapshot.knowledgeArtifacts.filter(
    (artifact) => artifact.status === "draft"
  );
  const memoryCandidates = snapshot.memories.filter((memory) => memory.status === "needs_review");
  const toggleEvidence = (id: string): void => {
    setExpandedEvidenceIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="page-grid two-column">
      <Section title={t("section.knowledgeDrafts")}>
        <div className="item-list compact">
          {knowledgeDrafts.map((artifact) => (
            <article className="list-item vertical" key={artifact.id}>
              <div className="item-heading">
                <h3>{artifact.title}</h3>
                <span>{status(artifact.status)}</span>
              </div>
              <p>{artifact.content.description}</p>
              <div className="meta-line review-metrics">
                <span>{formatConfidence(artifact.confidence, t("knowledge.confidence"))}</span>
                <span>
                  {artifact.evidence.length} {t("knowledge.evidenceCountLabel")}
                </span>
                <span>
                  {artifact.metadata.sourceSessionIds.length} {t("knowledge.sourceSessionsShort")}
                </span>
                <span>{sensitivity(inferEvidenceSensitivity(artifact.evidence))}</span>
              </div>
              <button
                className="text-button"
                onClick={() => toggleEvidence(artifact.id)}
                type="button"
              >
                {expandedEvidenceIds.has(artifact.id)
                  ? t("review.hideEvidence")
                  : t("review.showEvidence")}
              </button>
              {expandedEvidenceIds.has(artifact.id) ? (
                <EvidenceList evidence={artifact.evidence} limit={8} />
              ) : null}
              <div className="action-row">
                <button
                  className="secondary-button"
                  onClick={() => void onReviewKnowledge(artifact.id, "confirm")}
                  type="button"
                >
                  {t("action.confirm")}
                </button>
                <button
                  className="secondary-button"
                  onClick={() => void onReviewKnowledge(artifact.id, "reject")}
                  type="button"
                >
                  {t("action.reject")}
                </button>
                <button
                  className="secondary-button"
                  onClick={() => void onReviewKnowledge(artifact.id, "archive")}
                  type="button"
                >
                  {t("action.archive")}
                </button>
                <button
                  className="secondary-button"
                  onClick={() => onOpenKnowledge(artifact.id)}
                  type="button"
                >
                  {t("review.openKnowledge")}
                </button>
              </div>
            </article>
          ))}
          {knowledgeDrafts.length === 0 ? (
            <div className="empty-state">{t("empty.noKnowledgeDrafts")}</div>
          ) : null}
        </div>
      </Section>
      <Section title={t("section.memoryCandidates")}>
        <div className="item-list compact">
          {memoryCandidates.map((memory) => (
            <article className="list-item vertical" key={memory.id}>
              <div className="item-heading">
                <h3>{memory.title}</h3>
                <span>{status(memory.status)}</span>
              </div>
              <p>{memory.body}</p>
              <div className="meta-line review-metrics">
                <span>{formatConfidence(memory.confidence, t("knowledge.confidence"))}</span>
                <span>
                  {memory.evidence.length} {t("knowledge.evidenceCountLabel")}
                </span>
                <span>{sensitivity(inferEvidenceSensitivity(memory.evidence))}</span>
              </div>
              <button
                className="text-button"
                onClick={() => toggleEvidence(memory.id)}
                type="button"
              >
                {expandedEvidenceIds.has(memory.id)
                  ? t("review.hideEvidence")
                  : t("review.showEvidence")}
              </button>
              {expandedEvidenceIds.has(memory.id) ? (
                <EvidenceList evidence={memory.evidence} limit={8} />
              ) : null}
              <div className="action-row">
                <button
                  className="secondary-button"
                  onClick={() => void onReviewMemory(memory.id, "confirm")}
                  type="button"
                >
                  {t("action.confirm")}
                </button>
                <button
                  className="secondary-button"
                  onClick={() => void onReviewMemory(memory.id, "reject")}
                  type="button"
                >
                  {t("action.reject")}
                </button>
                <button
                  className="secondary-button"
                  onClick={() => void onReviewMemory(memory.id, "archive")}
                  type="button"
                >
                  {t("action.archive")}
                </button>
              </div>
            </article>
          ))}
          {memoryCandidates.length === 0 ? (
            <div className="empty-state">{t("empty.noMemoryCandidates")}</div>
          ) : null}
        </div>
      </Section>
    </div>
  );
}

function formatConfidence(confidence: number, label: string): string {
  return `${label} ${Math.round(confidence * 100)}%`;
}

function inferEvidenceSensitivity(
  evidence: DesktopSnapshot["knowledgeArtifacts"][number]["evidence"]
): "internal" | "confidential" {
  return evidence.some((ref) =>
    ["screen", "ocr", "audio", "transcript", "clipboard"].includes(ref.sourceKind)
  )
    ? "confidential"
    : "internal";
}
