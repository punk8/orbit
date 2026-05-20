import type { ReactElement } from "react";
import type { Memory } from "@orbit/core";
import { EvidenceList } from "../components/EvidenceList";
import { Section } from "../components/Section";

export function MemoryPage({ memories }: { memories: Memory[] }): ReactElement {
  return (
    <Section title="Memory Store">
      <div className="item-list compact">
        {memories.map((memory) => (
          <article className="list-item vertical" key={memory.id}>
            <div className="item-heading">
              <h3>{memory.title}</h3>
              <span>{memory.status}</span>
            </div>
            <p>{memory.body}</p>
            <div className="meta-line">
              {memory.kind}
              <span>{memory.scope.project ?? "global"}</span>
              <span>{Math.round(memory.confidence * 100)}%</span>
            </div>
            <EvidenceList evidence={memory.evidence} />
          </article>
        ))}
        {memories.length === 0 ? <div className="empty-state">No memories</div> : null}
      </div>
    </Section>
  );
}
