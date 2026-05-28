import { useState } from "react";
import type { ReactElement } from "react";
import type { DesktopSnapshot } from "../orbitApi";
import type { KnowledgeReviewAction, MemoryReviewAction } from "@orbit/db";
import { EvidenceList } from "../components/EvidenceList";
import { Section } from "../components/Section";
import { useI18n } from "../i18n";

interface ReviewQueueLastAction {
  id: string;
  kind: "knowledge" | "memory";
  action: KnowledgeReviewAction | MemoryReviewAction;
}

export function ReviewQueuePage({
  snapshot,
  onOpenKnowledge,
  onOpenMemory,
  onOpenActivitySession,
  onReviewKnowledge,
  onReviewMemory
}: {
  snapshot: DesktopSnapshot;
  onOpenKnowledge(id: string): void;
  onOpenMemory(id: string): void;
  onOpenActivitySession(id: string): void;
  onReviewKnowledge(id: string, action: KnowledgeReviewAction): Promise<void>;
  onReviewMemory(id: string, action: MemoryReviewAction): Promise<void>;
}): ReactElement {
  const { t, status, sensitivity, memoryKind, sourceKind } = useI18n();
  const [expandedEvidenceIds, setExpandedEvidenceIds] = useState<Set<string>>(new Set());
  const [lastAction, setLastAction] = useState<ReviewQueueLastAction | undefined>();
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
  const reviewKnowledge = async (id: string, action: KnowledgeReviewAction): Promise<void> => {
    await onReviewKnowledge(id, action);
    setLastAction({ id, kind: "knowledge", action });
    setExpandedEvidenceIds((current) => withoutExpandedEvidence(current, id));
  };
  const reviewMemory = async (id: string, action: MemoryReviewAction): Promise<void> => {
    await onReviewMemory(id, action);
    setLastAction({ id, kind: "memory", action });
    setExpandedEvidenceIds((current) => withoutExpandedEvidence(current, id));
  };

  return (
    <div className="page-grid two-column">
      <div className="review-queue-summary">
        <span>
          {t("review.pendingKnowledgeCount")}: {knowledgeDrafts.length}
        </span>
        <span>
          {t("review.pendingMemoryCount")}: {memoryCandidates.length}
        </span>
      </div>
      {lastAction ? (
        <div className="notice-banner inline review-action-feedback" data-review-feedback="last-action">
          {t("review.lastActionPrefix")} {reviewKindLabel(lastAction.kind, t)} ·{" "}
          {reviewActionLabel(lastAction.action, t)}
        </div>
      ) : null}
      <Section title={t("section.knowledgeDrafts")}>
        <div className="item-list compact">
          {knowledgeDrafts.map((artifact) => {
            const sourceSessionId = artifact.metadata.sourceSessionIds[0];
            return (
            <article className="list-item vertical" key={artifact.id}>
              <div className="item-heading">
                <h3>{artifact.title}</h3>
                <span>{status(artifact.status)}</span>
              </div>
              <p>{artifact.content.description}</p>
              <div className="review-queue-markdown-preview">
                <h4>{t("review.markdownPreview")}</h4>
                <pre className="markdown-preview">{artifact.content.markdown}</pre>
              </div>
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
                  onClick={() => void reviewKnowledge(artifact.id, "confirm")}
                  type="button"
                >
                  {t("action.confirm")}
                </button>
                <button
                  className="secondary-button"
                  onClick={() => void reviewKnowledge(artifact.id, "reject")}
                  type="button"
                >
                  {t("action.reject")}
                </button>
                <button
                  className="secondary-button"
                  onClick={() => void reviewKnowledge(artifact.id, "archive")}
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
                {sourceSessionId ? (
                  <button
                    className="secondary-button"
                    data-review-action="open-source-activity"
                    onClick={() => onOpenActivitySession(sourceSessionId)}
                    type="button"
                  >
                    {t("review.openSourceActivity")}
                  </button>
                ) : null}
              </div>
            </article>
            );
          })}
          {knowledgeDrafts.length === 0 ? (
            <div className="empty-state">{t("empty.noKnowledgeDrafts")}</div>
          ) : null}
        </div>
      </Section>
      <Section title={t("section.memoryCandidates")}>
        <div className="item-list compact">
          {memoryCandidates.map((memory) => {
            const sourceSessionId = memory.sourceSessionIds[0];
            return (
              <article className="list-item vertical" key={memory.id}>
                <div className="item-heading">
                  <h3>{memory.title}</h3>
                  <span>{status(memory.status)}</span>
                </div>
                <p>{memory.body}</p>
                <div className="review-memory-governance-preview">
                  <h4>{t("review.memoryGovernancePreview")}</h4>
                  <div>
                    <span>
                      {t("filter.kind")}: {memoryKind(memory.kind)}
                    </span>
                    <span>
                      {t("memory.scope")}: {formatReviewMemoryScope(memory, t)}
                    </span>
                    <span>
                      {t("filter.source")}: {formatReviewMemorySources(memory, sourceKind, t)}
                    </span>
                    <span>
                      {t("memory.tags")}: {memory.tags.join(", ") || t("fallback.none")}
                    </span>
                    <span>
                      {memory.status === "confirmed"
                        ? t("memory.agentContextAllowed")
                        : t("review.memoryAgentContextBlocked")}
                    </span>
                  </div>
                </div>
                <div className="meta-line review-metrics">
                  <span>{formatConfidence(memory.confidence, t("knowledge.confidence"))}</span>
                  <span>
                    {memory.evidence.length} {t("knowledge.evidenceCountLabel")}
                  </span>
                  <span>
                    {memory.sourceSessionIds.length} {t("knowledge.sourceSessionsShort")}
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
                    onClick={() => void reviewMemory(memory.id, "confirm")}
                    type="button"
                  >
                    {t("action.confirm")}
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => void reviewMemory(memory.id, "reject")}
                    type="button"
                  >
                    {t("action.reject")}
                  </button>
                  <button
                    className="secondary-button"
                    data-review-action="open-memory"
                    onClick={() => onOpenMemory(memory.id)}
                    type="button"
                  >
                    {t("review.openMemory")}
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => void reviewMemory(memory.id, "archive")}
                    type="button"
                  >
                    {t("action.archive")}
                  </button>
                  {sourceSessionId ? (
                    <button
                      className="secondary-button"
                      data-review-action="open-memory-source-activity"
                      onClick={() => onOpenActivitySession(sourceSessionId)}
                      type="button"
                    >
                      {t("review.openSourceActivity")}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
          {memoryCandidates.length === 0 ? (
            <div className="empty-state">{t("empty.noMemoryCandidates")}</div>
          ) : null}
        </div>
      </Section>
    </div>
  );
}

function withoutExpandedEvidence(current: Set<string>, id: string): Set<string> {
  const next = new Set(current);
  next.delete(id);
  return next;
}

function reviewKindLabel(
  kind: ReviewQueueLastAction["kind"],
  t: ReturnType<typeof useI18n>["t"]
): string {
  return kind === "knowledge" ? t("handoff.object.knowledge") : t("handoff.object.memory");
}

function reviewActionLabel(
  action: ReviewQueueLastAction["action"],
  t: ReturnType<typeof useI18n>["t"]
): string {
  if (action === "confirm") return t("review.action.confirm");
  if (action === "reject") return t("review.action.reject");
  return t("review.action.archive");
}

function formatConfidence(confidence: number, label: string): string {
  return `${label} ${Math.round(confidence * 100)}%`;
}

function formatReviewMemoryScope(
  memory: DesktopSnapshot["memories"][number],
  t: ReturnType<typeof useI18n>["t"]
): string {
  if (memory.scope.project) return memory.scope.project;
  if (memory.scope.global) return t("fallback.global");
  return memory.dimension;
}

function formatReviewMemorySources(
  memory: DesktopSnapshot["memories"][number],
  sourceKind: ReturnType<typeof useI18n>["sourceKind"],
  t: ReturnType<typeof useI18n>["t"]
): string {
  const sourceKinds = new Set([
    ...(memory.scope.sourceKinds ?? []),
    ...memory.evidence.map((ref) => ref.sourceKind)
  ]);
  return Array.from(sourceKinds).map((kind) => sourceKind(kind)).join(", ") || t("fallback.none");
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
