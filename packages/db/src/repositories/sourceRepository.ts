import type Database from "better-sqlite3";
import type { SourceAdapter, SourceRecord } from "@orbit/core";

interface SourceRow {
  id: string;
  kind: SourceRecord["kind"];
  display_name: string;
  enabled: number;
  paused: number;
  default_sensitivity: SourceRecord["defaultSensitivity"];
  last_sync_at: string | null;
  last_event_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export class SourceRepository {
  constructor(private readonly db: Database.Database) {}

  upsertFromAdapter(adapter: SourceAdapter): SourceRecord {
    const now = new Date().toISOString();
    const existing = this.getSource(adapter.id);
    const record: SourceRecord = {
      id: adapter.id,
      kind: adapter.kind,
      displayName: adapter.displayName,
      enabled: existing?.enabled ?? true,
      paused: existing?.paused ?? false,
      defaultSensitivity: adapter.defaultSensitivity,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    if (existing?.lastSyncAt) record.lastSyncAt = existing.lastSyncAt;
    if (existing?.lastEventAt) record.lastEventAt = existing.lastEventAt;
    if (existing?.lastError) record.lastError = existing.lastError;
    this.upsertSource(record);
    return record;
  }

  upsertSource(source: SourceRecord): void {
    this.db
      .prepare(
        `
        INSERT INTO sources (
          id, kind, display_name, enabled, paused, default_sensitivity,
          last_sync_at, last_event_at, last_error, created_at, updated_at
        )
        VALUES (
          @id, @kind, @displayName, @enabled, @paused, @defaultSensitivity,
          @lastSyncAt, @lastEventAt, @lastError, @createdAt, @updatedAt
        )
        ON CONFLICT(id) DO UPDATE SET
          kind = excluded.kind,
          display_name = excluded.display_name,
          enabled = excluded.enabled,
          paused = excluded.paused,
          default_sensitivity = excluded.default_sensitivity,
          last_sync_at = excluded.last_sync_at,
          last_event_at = excluded.last_event_at,
          last_error = excluded.last_error,
          updated_at = excluded.updated_at
      `
      )
      .run({
        ...source,
        enabled: source.enabled ? 1 : 0,
        paused: source.paused ? 1 : 0,
        lastSyncAt: source.lastSyncAt ?? null,
        lastEventAt: source.lastEventAt ?? null,
        lastError: source.lastError ?? null
      });
  }

  getSource(id: string): SourceRecord | undefined {
    const row = this.db.prepare("SELECT * FROM sources WHERE id = ?").get(id) as
      | SourceRow
      | undefined;
    return row ? mapSource(row) : undefined;
  }

  listSources(): SourceRecord[] {
    return this.db
      .prepare("SELECT * FROM sources ORDER BY id")
      .all()
      .map((row) => mapSource(row as SourceRow));
  }

  countSources(): number {
    return (this.db.prepare("SELECT count(*) as count FROM sources").get() as { count: number })
      .count;
  }

  getCursor(sourceId: string): string | undefined {
    const row = this.db
      .prepare("SELECT cursor FROM source_cursors WHERE source_id = ?")
      .get(sourceId) as { cursor: string | null } | undefined;
    return row?.cursor ?? undefined;
  }

  setCursor(sourceId: string, cursor: string | undefined): void {
    this.db
      .prepare(
        `
        INSERT INTO source_cursors (source_id, cursor, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(source_id) DO UPDATE SET
          cursor = excluded.cursor,
          updated_at = excluded.updated_at
      `
      )
      .run(sourceId, cursor ?? null, new Date().toISOString());
  }

  setEnabled(sourceId: string, enabled: boolean): void {
    this.db
      .prepare("UPDATE sources SET enabled = ?, updated_at = ? WHERE id = ?")
      .run(enabled ? 1 : 0, new Date().toISOString(), sourceId);
  }

  setPaused(sourceId: string, paused: boolean): void {
    this.db
      .prepare("UPDATE sources SET paused = ?, updated_at = ? WHERE id = ?")
      .run(paused ? 1 : 0, new Date().toISOString(), sourceId);
  }

  recordSyncSuccess(sourceId: string, options: { lastEventAt?: string | undefined } = {}): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
        UPDATE sources
        SET last_sync_at = ?,
            last_event_at = COALESCE(?, last_event_at),
            last_error = NULL,
            updated_at = ?
        WHERE id = ?
      `
      )
      .run(now, options.lastEventAt ?? null, now, sourceId);
  }

  recordSyncError(sourceId: string, error: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE sources SET last_sync_at = ?, last_error = ?, updated_at = ? WHERE id = ?")
      .run(now, error, now, sourceId);
  }
}

function mapSource(row: SourceRow): SourceRecord {
  const source: SourceRecord = {
    id: row.id,
    kind: row.kind,
    displayName: row.display_name,
    enabled: row.enabled === 1,
    paused: row.paused === 1,
    defaultSensitivity: row.default_sensitivity,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  if (row.last_sync_at) source.lastSyncAt = row.last_sync_at;
  if (row.last_event_at) source.lastEventAt = row.last_event_at;
  if (row.last_error) source.lastError = row.last_error;
  return source;
}
