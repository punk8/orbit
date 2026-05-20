import type { ReactElement } from "react";
import type { DesktopSnapshot } from "../orbitApi";
import { Section } from "../components/Section";

export function ReviewQueuePage({ snapshot }: { snapshot: DesktopSnapshot }): ReactElement {
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
              <h3>{artifact.title}</h3>
              <p>{artifact.content.description}</p>
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
              <h3>{memory.title}</h3>
              <p>{memory.body}</p>
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
