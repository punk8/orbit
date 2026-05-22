import type { SourceAdapter } from "../types/source";
import type { Event } from "../types/event";
import type { PermissionScope } from "../types/common";

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
  validatePermissionScope(adapter);
  const result = await adapter.readCursor(cursor);
  let inserted = 0;
  let skipped = 0;
  const warnings = [...(result.warnings ?? [])];

  for (const rawEvent of result.events) {
    const { event, warnings: eventWarnings } = applyStoragePolicy(rawEvent, adapter.permissionScope);
    warnings.push(...eventWarnings);
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
    warnings
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

function validatePermissionScope(adapter: SourceAdapter): void {
  const permissionScope = adapter.permissionScope as PermissionScope | undefined;
  if (!permissionScope) {
    throw new Error(`Source adapter ${adapter.id} did not declare a permission scope.`);
  }
  if (permissionScope.sourceKind !== adapter.kind) {
    throw new Error(
      `Source adapter ${adapter.id} declared permission scope for ${permissionScope.sourceKind}, expected ${adapter.kind}.`
    );
  }
  if (permissionScope.readableFields.length === 0) {
    throw new Error(`Source adapter ${adapter.id} declared no readable fields.`);
  }
  if (!permissionScope.canStoreSummary) {
    throw new Error(`Source adapter ${adapter.id} does not allow summary storage.`);
  }
}

function applyStoragePolicy(
  event: Event,
  permissionScope: PermissionScope
): { event: Event; warnings: string[] } {
  const warnings: string[] = [];
  const next: Event = {
    ...event,
    content: { ...event.content },
    privacy: {
      ...event.privacy,
      retentionPolicyId: permissionScope.retentionPolicyId
    }
  };

  if (next.privacy.sensitivity === "secret" && !permissionScope.canStoreRaw) {
    delete next.content.text;
    delete next.content.rawRef;
    delete next.content.attachments;
    if (next.content.summary) {
      next.content.summary = "[REDACTED SECRET]";
    }
    next.privacy.redactionState = "redacted";
    warnings.push(`Secret event ${next.id} was stored without raw content.`);
    return { event: next, warnings };
  }

  try {
    const title = redactText(next.content.title);
    const text = redactText(next.content.text);
    const summary = redactText(next.content.summary);
    if (title.value !== undefined) next.content.title = title.value;
    if (text.value !== undefined) next.content.text = text.value;
    if (summary.value !== undefined) next.content.summary = summary.value;
    if (title.redacted || text.redacted || summary.redacted) {
      next.privacy.redactionState = "redacted";
      syncMetadataRedactionState(next, "redacted");
      warnings.push(`Sensitive text was redacted from event ${next.id}.`);
    }
    if (!permissionScope.canStoreRaw) {
      delete next.content.rawRef;
      delete next.content.attachments;
      if (next.content.text) {
        next.content.summary = next.content.summary ?? truncate(next.content.text, 220);
        delete next.content.text;
      }
    }
  } catch (error) {
    delete next.content.text;
    delete next.content.rawRef;
    delete next.content.attachments;
    next.privacy.redactionState = "failed";
    syncMetadataRedactionState(next, "failed");
    warnings.push(
      `Redaction failed for event ${next.id}; raw text was not stored: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  return { event: next, warnings };
}

function syncMetadataRedactionState(
  event: Event,
  redactionState: Event["privacy"]["redactionState"]
): void {
  if (!event.content.metadata) return;
  event.content.metadata = {
    ...event.content.metadata,
    redactionState
  };
}

const sensitiveTextPatterns = [
  /authorization:\s*bearer\s+[a-z0-9._~+/=-]+/gi,
  /api[_-]?key\s*[:=]\s*["']?[a-z0-9._~+/=-]+["']?/gi,
  /password\s*[:=]\s*["']?[^"'\s]+["']?/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi,
  /\b(?:\+?\d[\d\s().-]{7,}\d)\b/g,
  /https?:\/\/[^\s"'<>]+/gi,
  /\/Users\/[^\s"'<>]+/g
];

function redactText(value: string | undefined): { value?: string; redacted: boolean } {
  if (value === undefined) return { redacted: false };
  let output = value;
  for (const pattern of sensitiveTextPatterns) {
    output = output.replace(pattern, "[REDACTED]");
  }
  return { value: output, redacted: output !== value };
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}
