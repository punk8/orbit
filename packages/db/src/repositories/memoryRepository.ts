import type Database from "better-sqlite3";
import type { Memory } from "@orbit/core";
import { decodeJson, encodeJson } from "../json";

interface MemoryRow {
  id: string;
  schema_version: number;
  kind: Memory["kind"];
  title: string;
  body: string;
  status: Memory["status"];
  scope_json: string;
  tags_json: string;
  evidence_json: string;
  confidence: number;
  valid_from: string | null;
  valid_until: string | null;
  last_reviewed_at: string | null;
  supersedes_json: string | null;
  created_at: string;
  updated_at: string;
}

export class MemoryRepository {
  constructor(private readonly db: Database.Database) {}

  upsertMemory(memory: Memory): void {
    this.db
      .prepare(
        `
        INSERT INTO memories (
          id, schema_version, kind, title, body, status, scope_json, tags_json,
          evidence_json, confidence, valid_from, valid_until, last_reviewed_at,
          supersedes_json, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          body = excluded.body,
          status = excluded.status,
          scope_json = excluded.scope_json,
          tags_json = excluded.tags_json,
          evidence_json = excluded.evidence_json,
          confidence = excluded.confidence,
          updated_at = excluded.updated_at
      `
      )
      .run(
        memory.id,
        memory.schemaVersion,
        memory.kind,
        memory.title,
        memory.body,
        memory.status,
        encodeJson(memory.scope),
        encodeJson(memory.tags),
        encodeJson(memory.evidence),
        memory.confidence,
        memory.validFrom ?? null,
        memory.validUntil ?? null,
        memory.lastReviewedAt ?? null,
        memory.supersedes ? encodeJson(memory.supersedes) : null,
        memory.createdAt,
        memory.updatedAt
      );

    this.db.prepare("DELETE FROM fts_memory WHERE id = ?").run(memory.id);
    this.db
      .prepare("INSERT INTO fts_memory (id, title, body) VALUES (?, ?, ?)")
      .run(memory.id, memory.title, memory.body);
  }

  searchMemory(query: string): Memory[] {
    return this.db
      .prepare(
        `
        SELECT m.* FROM memories m
        JOIN fts_memory fts ON fts.id = m.id
        WHERE fts_memory MATCH ?
        ORDER BY rank
      `
      )
      .all(query)
      .map((row) => mapMemory(row as MemoryRow));
  }

  listMemories(): Memory[] {
    return this.db
      .prepare("SELECT * FROM memories ORDER BY created_at, id")
      .all()
      .map((row) => mapMemory(row as MemoryRow));
  }

  getMemory(id: string): Memory | undefined {
    const row = this.db.prepare("SELECT * FROM memories WHERE id = ?").get(id) as
      | MemoryRow
      | undefined;
    return row ? mapMemory(row) : undefined;
  }

  deleteMemory(id: string): void {
    this.db.prepare("DELETE FROM memories WHERE id = ?").run(id);
    this.db.prepare("DELETE FROM fts_memory WHERE id = ?").run(id);
  }

  countMemories(): number {
    return (this.db.prepare("SELECT count(*) as count FROM memories").get() as { count: number })
      .count;
  }
}

function mapMemory(row: MemoryRow): Memory {
  const memory: Memory = {
    id: row.id,
    schemaVersion: row.schema_version,
    kind: row.kind,
    title: row.title,
    body: row.body,
    status: row.status,
    scope: decodeJson<Memory["scope"]>(row.scope_json),
    tags: decodeJson<string[]>(row.tags_json),
    evidence: decodeJson<Memory["evidence"]>(row.evidence_json),
    confidence: row.confidence,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  if (row.valid_from) memory.validFrom = row.valid_from;
  if (row.valid_until) memory.validUntil = row.valid_until;
  if (row.last_reviewed_at) memory.lastReviewedAt = row.last_reviewed_at;
  if (row.supersedes_json) memory.supersedes = decodeJson<string[]>(row.supersedes_json);
  return memory;
}
