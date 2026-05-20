import type Database from "better-sqlite3";
import type { Recommendation } from "@orbit/core";
import { decodeJson, encodeJson } from "../json";

interface RecommendationRow {
  id: string;
  schema_version: number;
  type: Recommendation["type"];
  title: string;
  explanation: string;
  suggested_action: string;
  confidence: number;
  impact: Recommendation["impact"];
  status: Recommendation["status"];
  evidence_json: string;
  created_at: string;
  due_at: string | null;
}

export class RecommendationRepository {
  constructor(private readonly db: Database.Database) {}

  upsertRecommendation(recommendation: Recommendation): void {
    this.db
      .prepare(
        `
        INSERT INTO recommendations (
          id, schema_version, type, title, explanation, suggested_action,
          confidence, impact, status, evidence_json, created_at, due_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          explanation = excluded.explanation,
          suggested_action = excluded.suggested_action,
          confidence = excluded.confidence,
          impact = excluded.impact,
          status = excluded.status,
          evidence_json = excluded.evidence_json,
          due_at = excluded.due_at
      `
      )
      .run(
        recommendation.id,
        recommendation.schemaVersion,
        recommendation.type,
        recommendation.title,
        recommendation.explanation,
        recommendation.suggestedAction,
        recommendation.confidence,
        recommendation.impact,
        recommendation.status,
        encodeJson(recommendation.evidence),
        recommendation.createdAt,
        recommendation.dueAt ?? null
      );
  }

  listRecommendations(): Recommendation[] {
    return this.db
      .prepare("SELECT * FROM recommendations ORDER BY created_at, id")
      .all()
      .map((row) => mapRecommendation(row as RecommendationRow));
  }

  getRecommendation(id: string): Recommendation | undefined {
    const row = this.db.prepare("SELECT * FROM recommendations WHERE id = ?").get(id) as
      | RecommendationRow
      | undefined;
    return row ? mapRecommendation(row) : undefined;
  }

  countRecommendations(): number {
    return (
      this.db.prepare("SELECT count(*) as count FROM recommendations").get() as { count: number }
    ).count;
  }
}

function mapRecommendation(row: RecommendationRow): Recommendation {
  const recommendation: Recommendation = {
    id: row.id,
    schemaVersion: row.schema_version,
    type: row.type,
    title: row.title,
    explanation: row.explanation,
    suggestedAction: row.suggested_action,
    confidence: row.confidence,
    impact: row.impact,
    status: row.status,
    evidence: decodeJson<Recommendation["evidence"]>(row.evidence_json),
    createdAt: row.created_at
  };
  if (row.due_at) recommendation.dueAt = row.due_at;
  return recommendation;
}
