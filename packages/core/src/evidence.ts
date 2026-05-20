import type { EvidenceRef } from "./types/common";
import type { Event } from "./types/event";

export function evidenceFromEvent(event: Event, excerpt?: string): EvidenceRef {
  const ref: EvidenceRef = {
    eventId: event.id,
    sourceKind: event.source.kind,
    sourcePointer: event.source.pointer,
    timestamp: event.occurredAt
  };

  if (excerpt !== undefined) {
    ref.excerpt = excerpt;
  }

  return ref;
}
