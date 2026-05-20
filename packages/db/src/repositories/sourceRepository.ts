import type Database from "better-sqlite3";
import type { SourceAdapter, SourceRecord } from "@orbit/core";

interface SourceRow {
  id: string;
  kind: SourceRecord["kind"];
  display_name: string;
  enabled: number;
  default_sensitivity: SourceRecord["defaultSensitivity"];
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
      defaultSensitivity: adapter.defaultSensitivity,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    this.upsertSource(record);
    return record;
  }

  upsertSource(source: SourceRecord): void {
    this.db
      .prepare(
        `
        INSERT INTO sources (id, kind, display_name, enabled, default_sensitivity, created_at, updated_at)
        VALUES (@id, @kind, @displayName, @enabled, @defaultSensitivity, @createdAt, @updatedAt)
        ON CONFLICT(id) DO UPDATE SET
          kind = excluded.kind,
          display_name = excluded.display_name,
          enabled = excluded.enabled,
          default_sensitivity = excluded.default_sensitivity,
          updated_at = excluded.updated_at
      `
      )
      .run({ ...source, enabled: source.enabled ? 1 : 0 });
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
}

function mapSource(row: SourceRow): SourceRecord {
  return {
    id: row.id,
    kind: row.kind,
    displayName: row.display_name,
    enabled: row.enabled === 1,
    defaultSensitivity: row.default_sensitivity,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
