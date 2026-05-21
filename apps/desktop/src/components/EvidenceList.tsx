import type { ReactElement } from "react";
import type { EvidenceRef } from "@orbit/core";
import { useI18n } from "../i18n";

export function EvidenceList({
  evidence,
  limit = 4
}: {
  evidence: EvidenceRef[];
  limit?: number;
}): ReactElement {
  const { t, sourceKind } = useI18n();

  if (evidence.length === 0) {
    return <span className="muted">{t("fallback.noEvidence")}</span>;
  }

  return (
    <ul className="evidence-list">
      {evidence.slice(0, limit).map((ref, index) => (
        <li key={`${ref.sourcePointer}-${index}`}>
          <span>{sourceKind(ref.sourceKind)}</span>
          <code>{ref.sourcePointer}</code>
          {ref.excerpt ? <span>{ref.excerpt}</span> : null}
        </li>
      ))}
    </ul>
  );
}
