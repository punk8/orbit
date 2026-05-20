import type { ReactElement } from "react";
import type { DesktopSnapshot } from "../orbitApi";
import type { KnowledgeReviewAction, MemoryReviewAction } from "@orbit/db";
import { Section } from "../components/Section";

export function ReviewQueuePage({
  snapshot,
  onReviewKnowledge,
  onReviewMemory
}: {
  snapshot: DesktopSnapshot;
  onReviewKnowledge(id: string, action: KnowledgeReviewAction): Promise<void>;
  onReviewMemory(id: string, action: MemoryReviewAction): Promise<void>;
}): ReactElement {
  const knowledgeDrafts = snapshot.knowledgeArtifacts.filter(
    (artifact) => artifact.status === "draft"
  );
  const memoryCandidates = snapshot.memories.filter((memory) => memory.status === "needs_review");

  return (
    <div className="page-grid two-column">
      <Section title="Knowledge Drafts">
        <div className="item-list compact">
          {knowledgeDrafts.map((artifact) => (
            <article className="list-item vertical" key={artifact.id}>
              <div className="item-heading">
                <h3>{artifact.title}</h3>
                <span>{artifact.status}</span>
              </div>
              <p>{artifact.content.description}</p>
              <div className="action-row">
                <button
                  className="secondary-button"
                  onClick={() => void onReviewKnowledge(artifact.id, "confirm")}
                  type="button"
                >
                  Confirm
                </button>
                <button
                  className="secondary-button"
                  onClick={() => void onReviewKnowledge(artifact.id, "reject")}
                  type="button"
                >
                  Reject
                </button>
                <button
                  className="secondary-button"
                  onClick={() => void onReviewKnowledge(artifact.id, "archive")}
                  type="button"
                >
                  Archive
                </button>
              </div>
            </article>
          ))}
          {knowledgeDrafts.length === 0 ? (
            <div className="empty-state">No knowledge drafts</div>
          ) : null}
        </div>
      </Section>
      <Section title="Memory Candidates">
        <div className="item-list compact">
          {memoryCandidates.map((memory) => (
            <article className="list-item vertical" key={memory.id}>
              <div className="item-heading">
                <h3>{memory.title}</h3>
                <span>{memory.status}</span>
              </div>
              <p>{memory.body}</p>
              <div className="action-row">
                <button
                  className="secondary-button"
                  onClick={() => void onReviewMemory(memory.id, "confirm")}
                  type="button"
                >
                  Confirm
                </button>
                <button
                  className="secondary-button"
                  onClick={() => void onReviewMemory(memory.id, "reject")}
                  type="button"
                >
                  Reject
                </button>
                <button
                  className="secondary-button"
                  onClick={() => void onReviewMemory(memory.id, "archive")}
                  type="button"
                >
                  Archive
                </button>
              </div>
            </article>
          ))}
          {memoryCandidates.length === 0 ? (
            <div className="empty-state">No memory candidates</div>
          ) : null}
        </div>
      </Section>
    </div>
  );
}
