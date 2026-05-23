import type Database from "better-sqlite3";
import type { Memory } from "@orbit/core";
import { decodeJson, encodeJson } from "../json";

interface MemoryRow {
  id: string;
  schema_version: number;
  kind: Memory["kind"];
  dimension: Memory["dimension"] | null;
  title: string;
  body: string;
  status: Memory["status"];
  scope_json: string;
  source_session_ids_json: string | null;
  tags_json: string;
  evidence_json: string;
  confidence: number;
  version: number;
  index_state_json: string | null;
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
    const normalized = normalizeMemory(memory);
    this.db
      .prepare(
        `
        INSERT INTO memories (
          id, schema_version, kind, dimension, title, body, status, scope_json,
          source_session_ids_json, tags_json, evidence_json, confidence, version,
          index_state_json, valid_from, valid_until, last_reviewed_at, supersedes_json,
          created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          body = excluded.body,
          status = excluded.status,
          dimension = excluded.dimension,
          scope_json = excluded.scope_json,
          source_session_ids_json = excluded.source_session_ids_json,
          tags_json = excluded.tags_json,
          evidence_json = excluded.evidence_json,
          confidence = excluded.confidence,
          version = excluded.version,
          index_state_json = excluded.index_state_json,
          updated_at = excluded.updated_at
      `
      )
      .run(
        normalized.id,
        normalized.schemaVersion,
        normalized.kind,
        normalized.dimension,
        normalized.title,
        normalized.body,
        normalized.status,
        encodeJson(normalized.scope),
        encodeJson(normalized.sourceSessionIds),
        encodeJson(normalized.tags),
        encodeJson(normalized.evidence),
        normalized.confidence,
        normalized.version,
        encodeJson(normalized.indexState),
        normalized.validFrom ?? null,
        normalized.validUntil ?? null,
        normalized.lastReviewedAt ?? null,
        normalized.supersedes ? encodeJson(normalized.supersedes) : null,
        normalized.createdAt,
        normalized.updatedAt
      );

    this.db.prepare("DELETE FROM fts_memory WHERE id = ?").run(normalized.id);
    this.db
      .prepare("INSERT INTO fts_memory (id, title, body) VALUES (?, ?, ?)")
      .run(normalized.id, normalized.title, normalized.body);
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
  const scope = decodeJson<Memory["scope"]>(row.scope_json);
  const memory: Memory = {
    id: row.id,
    schemaVersion: row.schema_version,
    kind: row.kind,
    dimension: row.dimension ?? dimensionFromScope(scope),
    title: row.title,
    body: row.body,
    status: row.status,
    scope,
    sourceSessionIds: row.source_session_ids_json
      ? decodeJson<string[]>(row.source_session_ids_json)
      : [],
    tags: decodeJson<string[]>(row.tags_json),
    evidence: decodeJson<Memory["evidence"]>(row.evidence_json),
    confidence: row.confidence,
    version: row.version ?? 1,
    indexState: row.index_state_json
      ? decodeJson<Memory["indexState"]>(row.index_state_json)
      : defaultIndexState(),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  if (row.valid_from) memory.validFrom = row.valid_from;
  if (row.valid_until) memory.validUntil = row.valid_until;
  if (row.last_reviewed_at) memory.lastReviewedAt = row.last_reviewed_at;
  if (row.supersedes_json) memory.supersedes = decodeJson<string[]>(row.supersedes_json);
  return memory;
}

function normalizeMemory(memory: Memory): Memory {
  const memoryWithLegacyShape = memory as Memory & {
    dimension?: Memory["dimension"];
    sourceSessionIds?: string[];
    version?: number;
    indexState?: Memory["indexState"];
  };
  return {
    ...memory,
    dimension: memoryWithLegacyShape.dimension ?? dimensionFromScope(memory.scope),
    sourceSessionIds: memoryWithLegacyShape.sourceSessionIds ?? [],
    version: memoryWithLegacyShape.version ?? 1,
    indexState: memoryWithLegacyShape.indexState ?? defaultIndexState()
  };
}

function dimensionFromScope(scope: Memory["scope"]): Memory["dimension"] {
  return scope.project ? "project" : "global";
}

function defaultIndexState(): Memory["indexState"] {
  return {
    provider: "fts",
    status: "indexed",
    fallbackOrder: ["local_embedding", "local_endpoint", "fts"]
  };
}
