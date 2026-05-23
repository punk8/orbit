import type { Event, EventWriter, IngestEventsResult } from "@orbit/core";
import { ingestEventsFromAdapter, type SourceAdapter } from "@orbit/core";
import type { VisionProvider } from "@orbit/ai";
import {
  VisionSummaryAdapter,
  VISION_SUMMARY_ADAPTER_ID,
  type VisionSummaryPolicy
} from "@orbit/adapters";

export interface DesktopVisionSourceRepository {
  upsertFromAdapter(adapter: SourceAdapter): unknown;
  getCursor(sourceId: string): string | undefined;
  setCursor(sourceId: string, cursor: string | undefined): void;
  recordSyncSuccess(sourceId: string, options?: { lastEventAt?: string | undefined }): void;
  recordSyncError(sourceId: string, error: string): void;
}

export interface IngestVisionSummariesForDesktopOptions {
  screenEvents: Event[];
  ocrEvents: Event[];
  provider: VisionProvider;
  policy: VisionSummaryPolicy;
  sourceRepository: DesktopVisionSourceRepository;
  eventRepository: EventWriter;
  language?: string;
}

export async function ingestVisionSummariesForDesktop(
  options: IngestVisionSummariesForDesktopOptions
): Promise<IngestEventsResult> {
  const adapter = new VisionSummaryAdapter({
    screenEvents: options.screenEvents,
    ocrEvents: options.ocrEvents,
    provider: options.provider,
    policy: options.policy,
    ...(options.language ? { language: options.language } : {})
  });
  options.sourceRepository.upsertFromAdapter(adapter);
  const cursor = options.sourceRepository.getCursor(adapter.id);
  try {
    const result = await ingestEventsFromAdapter(adapter, options.eventRepository, cursor);
    options.sourceRepository.setCursor(adapter.id, result.nextCursor);
    options.sourceRepository.recordSyncSuccess(adapter.id, { lastEventAt: result.lastEventAt });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    options.sourceRepository.recordSyncError(adapter.id, message);
    return {
      adapterId: adapter.id,
      read: 0,
      inserted: 0,
      skipped: 0,
      warnings: [`Vision summary ingestion failed: ${message}`],
      audit: []
    };
  }
}

export function selectVisionIngestionEvents(events: Event[]): {
  screenEvents: Event[];
  ocrEvents: Event[];
} {
  const screenEvents = events.filter(
    (event) =>
      event.source.adapterId !== VISION_SUMMARY_ADAPTER_ID &&
      event.source.kind === "screen" &&
      event.type === "screen_observation"
  );
  const ocrEvents = events.filter(
    (event) => event.source.kind === "ocr" && event.type === "ocr_text"
  );
  return { screenEvents, ocrEvents };
}
