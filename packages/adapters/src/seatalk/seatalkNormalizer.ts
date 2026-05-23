import type { Actor, EventType, Sensitivity } from "@orbit/core";

export interface ApprovedSeaTalkImportRecord {
  sourceKind: "seatalk";
  occurredAt: string;
  type: EventType;
  externalId?: string;
  actor?: Actor;
  context?: Record<string, unknown>;
  title?: string;
  text?: string;
  summary?: string;
  sensitivity?: Sensitivity;
  classification?: {
    topics: string[];
    entities: string[];
  };
}

export function normalizeApprovedSeaTalkRecord(
  record: ApprovedSeaTalkImportRecord
): ApprovedSeaTalkImportRecord {
  if (record.sourceKind !== "seatalk") {
    throw new Error(
      `Approved SeaTalk imports must use sourceKind=seatalk, got ${record.sourceKind}`
    );
  }

  return {
    ...record,
    sensitivity: record.sensitivity ?? "confidential",
    context: {
      app: "SeaTalk",
      ...record.context
    }
  };
}
