import type { ReactElement } from "react";
import type { EvidenceRef } from "@orbit/core";
import { useI18n } from "../i18n";

export function EvidenceList({
  evidence,
  highlightedEventIds = [],
  limit = 4
}: {
  evidence: EvidenceRef[];
  highlightedEventIds?: string[] | undefined;
  limit?: number;
}): ReactElement {
  const { t, sourceKind } = useI18n();
  const highlightedEvents = new Set(highlightedEventIds);

  if (evidence.length === 0) {
    return <span className="muted">{t("fallback.noEvidence")}</span>;
  }

  return (
    <ul className="evidence-list">
      {evidence.slice(0, limit).map((ref, index) => {
        const isHighlighted = Boolean(ref.eventId && highlightedEvents.has(ref.eventId));
        return (
          <li
            className={isHighlighted ? "focused-evidence" : undefined}
            data-evidence-focus={isHighlighted ? "event" : undefined}
            key={`${ref.sourcePointer}-${index}`}
          >
            <span>{sourceKind(ref.sourceKind)}</span>
            <code>{ref.sourcePointer}</code>
            {ref.excerpt ? <span>{ref.excerpt}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}
