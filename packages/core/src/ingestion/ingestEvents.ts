import type { SourceAdapter } from "../types/source";
import type { Event } from "../types/event";

export interface EventWriter {
  upsertEvent(event: Event): boolean | Promise<boolean>;
}

export interface IngestEventsResult {
  adapterId: string;
  read: number;
  inserted: number;
  skipped: number;
  lastEventAt?: string;
  nextCursor?: string;
  warnings: string[];
}

export async function ingestEventsFromAdapter(
  adapter: SourceAdapter,
  writer: EventWriter,
  cursor?: string
): Promise<IngestEventsResult> {
  const result = await adapter.readCursor(cursor);
  let inserted = 0;
  let skipped = 0;

  for (const event of result.events) {
    const didInsert = await writer.upsertEvent(event);
    if (didInsert) {
      inserted += 1;
    } else {
      skipped += 1;
    }
  }

  const ingestResult: IngestEventsResult = {
    adapterId: adapter.id,
    read: result.events.length,
    inserted,
    skipped,
    warnings: result.warnings ?? []
  };
  const lastEventAt = result.events
    .map((event) => event.occurredAt)
    .sort()
    .at(-1);
  if (lastEventAt) {
    ingestResult.lastEventAt = lastEventAt;
  }
  if (result.nextCursor !== undefined) {
    ingestResult.nextCursor = result.nextCursor;
  }
  return ingestResult;
}
