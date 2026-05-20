import type { ReactElement } from "react";
import type { EvidenceRef } from "@orbit/core";
import { useI18n } from "../i18n";

export function EvidenceList({ evidence }: { evidence: EvidenceRef[] }): ReactElement {
  const { t } = useI18n();

  if (evidence.length === 0) {
    return <span className="muted">{t("fallback.noEvidence")}</span>;
  }

  return (
    <ul className="evidence-list">
      {evidence.slice(0, 4).map((ref, index) => (
        <li key={`${ref.sourcePointer}-${index}`}>
          <span>{ref.sourceKind}</span>
          <code>{ref.sourcePointer}</code>
        </li>
      ))}
    </ul>
  );
}
