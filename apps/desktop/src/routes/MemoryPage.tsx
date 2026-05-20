import type { ReactElement } from "react";
import type { Memory } from "@orbit/core";
import { EvidenceList } from "../components/EvidenceList";
import { Section } from "../components/Section";
import { useI18n } from "../i18n";

export function MemoryPage({ memories }: { memories: Memory[] }): ReactElement {
  const { t, status } = useI18n();

  return (
    <Section title={t("section.memoryStore")}>
      <div className="item-list compact">
        {memories.map((memory) => (
          <article className="list-item vertical" key={memory.id}>
            <div className="item-heading">
              <h3>{memory.title}</h3>
              <span>{status(memory.status)}</span>
            </div>
            <p>{memory.body}</p>
            <div className="meta-line">
              {memory.kind}
              <span>{memory.scope.project ?? t("fallback.global")}</span>
              <span>{Math.round(memory.confidence * 100)}%</span>
            </div>
            <EvidenceList evidence={memory.evidence} />
          </article>
        ))}
        {memories.length === 0 ? (
          <div className="empty-state">{t("empty.noMemories")}</div>
        ) : null}
      </div>
    </Section>
  );
}
