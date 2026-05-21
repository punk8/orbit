import type Database from "better-sqlite3";
import type { Actor, Event } from "@orbit/core";
import { decodeJson, encodeJson } from "../json";

interface EventRow {
  id: string;
  schema_version: number;
  source_kind: Event["source"]["kind"];
  adapter_id: string;
  external_id: string | null;
  pointer: string;
  occurred_at: string;
  observed_at: string;
  actor_json: string | null;
  context_json: string;
  type: Event["type"];
  content_json: string;
  classification_json: string | null;
  privacy_json: string;
  hash: string;
}

export class EventRepository {
  constructor(private readonly db: Database.Database) {}

  upsertEvent(event: Event): boolean {
    const result = this.db
      .prepare(
        `
        INSERT OR IGNORE INTO events (
          id, schema_version, source_kind, adapter_id, external_id, pointer,
          occurred_at, observed_at, actor_json, context_json, type, content_json,
          classification_json, privacy_json, hash, created_at
        )
        VALUES (
          @id, @schemaVersion, @sourceKind, @adapterId, @externalId, @pointer,
          @occurredAt, @observedAt, @actorJson, @contextJson, @type, @contentJson,
          @classificationJson, @privacyJson, @hash, @createdAt
        )
      `
      )
      .run({
        id: event.id,
        schemaVersion: event.schemaVersion,
        sourceKind: event.source.kind,
        adapterId: event.source.adapterId,
        externalId: event.source.externalId ?? null,
        pointer: event.source.pointer,
        occurredAt: event.occurredAt,
        observedAt: event.observedAt,
        actorJson: event.actor ? encodeJson(event.actor) : null,
        contextJson: encodeJson(event.context),
        type: event.type,
        contentJson: encodeJson(event.content),
        classificationJson: event.classification ? encodeJson(event.classification) : null,
        privacyJson: encodeJson(event.privacy),
        hash: event.hash,
        createdAt: new Date().toISOString()
      });

    return result.changes > 0;
  }

  getEvent(id: string): Event | undefined {
    const row = this.db.prepare("SELECT * FROM events WHERE id = ?").get(id) as
      | EventRow
      | undefined;
    return row ? mapEvent(row) : undefined;
  }

  updateEventPrivacyAndContent(event: Event): void {
    this.db
      .prepare(
        `
        UPDATE events
        SET content_json = ?,
            privacy_json = ?
        WHERE id = ?
      `
      )
      .run(encodeJson(event.content), encodeJson(event.privacy), event.id);
  }

  listEvents(): Event[] {
    return this.db
      .prepare("SELECT * FROM events ORDER BY occurred_at, id")
      .all()
      .map((row) => mapEvent(row as EventRow));
  }

  countEvents(): number {
    return (this.db.prepare("SELECT count(*) as count FROM events").get() as { count: number })
      .count;
  }
}

function mapEvent(row: EventRow): Event {
  const source: Event["source"] = {
    kind: row.source_kind,
    adapterId: row.adapter_id,
    pointer: row.pointer
  };
  if (row.external_id !== null) {
    source.externalId = row.external_id;
  }

  const event: Event = {
    id: row.id,
    schemaVersion: row.schema_version,
    source,
    occurredAt: row.occurred_at,
    observedAt: row.observed_at,
    context: decodeJson<Event["context"]>(row.context_json),
    type: row.type,
    content: decodeJson<Event["content"]>(row.content_json),
    privacy: decodeJson<Event["privacy"]>(row.privacy_json),
    hash: row.hash
  };

  if (row.actor_json) {
    event.actor = decodeJson<Actor>(row.actor_json);
  }
  if (row.classification_json) {
    event.classification = decodeJson<NonNullable<Event["classification"]>>(
      row.classification_json
    );
  }

  return event;
}
