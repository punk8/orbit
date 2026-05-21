import type { Event } from "@orbit/core";
import type { OrbitDatabase } from "./connection";
import { AuditRepository } from "./repositories/auditRepository";
import { EventRepository } from "./repositories/eventRepository";
import { SourceRepository } from "./repositories/sourceRepository";
import { runSemanticPipeline } from "./semanticPipeline";

export interface PrivacyCleanupResult {
  scannedEvents: number;
  cleanedEvents: number;
  skippedEvents: number;
}

export function cleanupLegacyEventPrivacy(database: OrbitDatabase): PrivacyCleanupResult {
  const events = new EventRepository(database.db);
  const sources = new SourceRepository(database.db);
  const audit = new AuditRepository(database.db);
  let scannedEvents = 0;
  let cleanedEvents = 0;
  let skippedEvents = 0;

  for (const event of events.listEvents()) {
    scannedEvents += 1;
    const source = sources.getSource(event.source.adapterId);
    const policy = source?.permissionScope;
    if (!event.content.text || policy?.canStoreRaw) {
      skippedEvents += 1;
      continue;
    }

    events.updateEventPrivacyAndContent(minimizeRawEventText(event));
    cleanedEvents += 1;
  }

  audit.log("privacy.cleanup_legacy_events", "database", undefined, {
    scannedEvents,
    cleanedEvents,
    skippedEvents
  });

  if (cleanedEvents > 0) {
    runSemanticPipeline(database);
  }

  return { scannedEvents, cleanedEvents, skippedEvents };
}

function minimizeRawEventText(event: Event): Event {
  const summary = buildSafeSummary(event);
  return {
    ...event,
    content: {
      ...withoutRawText(event.content),
      summary
    },
    privacy: {
      ...event.privacy,
      redactionState: event.privacy.redactionState === "failed" ? "failed" : "redacted"
    }
  };
}

function withoutRawText(content: Event["content"]): Event["content"] {
  const next = { ...content };
  delete next.text;
  return next;
}

function buildSafeSummary(event: Event): string {
  if (event.privacy.sensitivity === "secret") return "[REDACTED SECRET]";
  if (event.privacy.redactionState === "failed")
    return "[RAW TEXT REMOVED AFTER REDACTION FAILURE]";
  return event.content.summary ?? summarizeLegacyText(event.content.text ?? "");
}

function summarizeLegacyText(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 240 ? `${normalized.slice(0, 237)}...` : normalized;
}
