import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildTodayContext, getLocalDateKey } from "@orbit/core";
import type { TodayContext } from "@orbit/core";
import type { OrbitDatabase } from "./connection";
import { ActivityRepository } from "./repositories/activityRepository";
import { AuditRepository } from "./repositories/auditRepository";
import { KnowledgeRepository } from "./repositories/knowledgeRepository";
import { MemoryRepository } from "./repositories/memoryRepository";
import { RecommendationRepository } from "./repositories/recommendationRepository";
import { SourceRepository } from "./repositories/sourceRepository";
import {
  runSemanticPipeline,
  runSemanticPipelineWithProvider,
  type SemanticPipelineOptions,
  type SemanticPipelineResult
} from "./semanticPipeline";

export interface ReindexResult {
  pipeline: SemanticPipelineResult;
}

export interface ClearLocalDataResult {
  deletedTables: Record<string, number>;
}

export interface ExportContextResult {
  path: string;
  today: TodayContext;
}

export function reindexLocalData(database: OrbitDatabase): ReindexResult {
  const pipeline = runSemanticPipeline(database);
  new AuditRepository(database.db).log("local_data.reindex", "database", undefined, {
    pipeline
  });
  return { pipeline };
}

export async function reindexLocalDataWithProvider(
  database: OrbitDatabase,
  options: SemanticPipelineOptions = {}
): Promise<ReindexResult> {
  const pipeline = await runSemanticPipelineWithProvider(database, options);
  new AuditRepository(database.db).log("local_data.reindex", "database", undefined, {
    pipeline,
    aiProvider: options.aiProvider?.id ?? "disabled"
  });
  return { pipeline };
}

export function clearLocalData(database: OrbitDatabase): ClearLocalDataResult {
  const tables = [
    "recommendation_sources",
    "recommendations",
    "memory_sources",
    "memories",
    "knowledge_sources",
    "knowledge_artifacts",
    "activity_event_links",
    "activity_sessions",
    "events",
    "source_cursors",
    "sources",
    "fts_knowledge",
    "fts_memory"
  ];
  const deletedTables: Record<string, number> = {};
  const transaction = database.db.transaction(() => {
    for (const table of tables) {
      deletedTables[table] = database.db.prepare(`DELETE FROM ${table}`).run().changes;
    }
  });
  transaction();
  new AuditRepository(database.db).log("local_data.clear", "database", undefined, {
    deletedTables
  });
  return { deletedTables };
}

export function exportTodayContext(
  database: OrbitDatabase,
  date = getLocalDateKey()
): ExportContextResult {
  const activityRepository = new ActivityRepository(database.db);
  const knowledgeRepository = new KnowledgeRepository(database.db);
  const memoryRepository = new MemoryRepository(database.db);
  const recommendationRepository = new RecommendationRepository(database.db);
  const sourceRepository = new SourceRepository(database.db);
  const today = buildTodayContext({
    date,
    activitySessions: activityRepository.listActivitySessions(),
    knowledgeArtifacts: knowledgeRepository
      .listKnowledgeArtifacts()
      .filter((artifact) => artifact.status === "confirmed"),
    memories: memoryRepository.listMemories().filter((memory) => memory.status === "confirmed"),
    recommendations: recommendationRepository
      .listRecommendations()
      .filter((recommendation) => recommendation.evidence.length > 0)
  });
  const exportDir = join(database.orbitHome, "exports");
  mkdirSync(exportDir, { recursive: true });
  const path = join(exportDir, `orbit-context-${date}.json`);
  writeFileSync(
    path,
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        orbitHome: database.orbitHome,
        dbPath: database.dbPath,
        sources: sourceRepository.listSources(),
        today
      },
      null,
      2
    )
  );
  new AuditRepository(database.db).log("local_data.export_context", "context_export", path, {
    date,
    scope: "summary_confirmed_context",
    includesRawEvents: false
  });
  return { path, today };
}
