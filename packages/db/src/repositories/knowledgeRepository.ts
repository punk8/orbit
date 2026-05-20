import type Database from "better-sqlite3";
import type { KnowledgeArtifact } from "@orbit/core";
import { decodeJson, encodeJson } from "../json";

interface KnowledgeRow {
  id: string;
  schema_version: number;
  type: KnowledgeArtifact["type"];
  title: string;
  status: KnowledgeArtifact["status"];
  metadata_json: string;
  content_json: string;
  evidence_json: string;
  memory_candidate_ids_json: string | null;
  confidence: number;
  created_at: string;
  updated_at: string;
}

export class KnowledgeRepository {
  constructor(private readonly db: Database.Database) {}

  upsertKnowledgeArtifact(artifact: KnowledgeArtifact): void {
    this.db
      .prepare(
        `
        INSERT INTO knowledge_artifacts (
          id, schema_version, type, title, status, metadata_json, content_json,
          evidence_json, memory_candidate_ids_json, confidence, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          status = excluded.status,
          metadata_json = excluded.metadata_json,
          content_json = excluded.content_json,
          evidence_json = excluded.evidence_json,
          memory_candidate_ids_json = excluded.memory_candidate_ids_json,
          confidence = excluded.confidence,
          updated_at = excluded.updated_at
      `
      )
      .run(
        artifact.id,
        artifact.schemaVersion,
        artifact.type,
        artifact.title,
        artifact.status,
        encodeJson(artifact.metadata),
        encodeJson(artifact.content),
        encodeJson(artifact.evidence),
        artifact.memoryCandidateIds ? encodeJson(artifact.memoryCandidateIds) : null,
        artifact.confidence,
        artifact.createdAt,
        artifact.updatedAt
      );

    this.db.prepare("DELETE FROM fts_knowledge WHERE id = ?").run(artifact.id);
    this.db
      .prepare("INSERT INTO fts_knowledge (id, title, markdown) VALUES (?, ?, ?)")
      .run(artifact.id, artifact.title, artifact.content.markdown);
  }

  searchKnowledge(query: string): KnowledgeArtifact[] {
    return this.db
      .prepare(
        `
        SELECT ka.* FROM knowledge_artifacts ka
        JOIN fts_knowledge fts ON fts.id = ka.id
        WHERE fts_knowledge MATCH ?
        ORDER BY rank
      `
      )
      .all(query)
      .map((row) => mapKnowledge(row as KnowledgeRow));
  }

  listKnowledgeArtifacts(): KnowledgeArtifact[] {
    return this.db
      .prepare("SELECT * FROM knowledge_artifacts ORDER BY created_at, id")
      .all()
      .map((row) => mapKnowledge(row as KnowledgeRow));
  }

  getKnowledgeArtifact(id: string): KnowledgeArtifact | undefined {
    const row = this.db.prepare("SELECT * FROM knowledge_artifacts WHERE id = ?").get(id) as
      | KnowledgeRow
      | undefined;
    return row ? mapKnowledge(row) : undefined;
  }

  deleteKnowledgeArtifact(id: string): void {
    this.db.prepare("DELETE FROM knowledge_artifacts WHERE id = ?").run(id);
    this.db.prepare("DELETE FROM fts_knowledge WHERE id = ?").run(id);
  }

  countKnowledgeArtifacts(): number {
    return (
      this.db.prepare("SELECT count(*) as count FROM knowledge_artifacts").get() as {
        count: number;
      }
    ).count;
  }
}

function mapKnowledge(row: KnowledgeRow): KnowledgeArtifact {
  const artifact: KnowledgeArtifact = {
    id: row.id,
    schemaVersion: row.schema_version,
    type: row.type,
    title: row.title,
    status: row.status,
    metadata: decodeJson<KnowledgeArtifact["metadata"]>(row.metadata_json),
    content: decodeJson<KnowledgeArtifact["content"]>(row.content_json),
    evidence: decodeJson<KnowledgeArtifact["evidence"]>(row.evidence_json),
    confidence: row.confidence,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  if (row.memory_candidate_ids_json) {
    artifact.memoryCandidateIds = decodeJson<string[]>(row.memory_candidate_ids_json);
  }
  return artifact;
}
