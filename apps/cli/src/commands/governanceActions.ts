import type {
  KnowledgeActionResult,
  KnowledgeEditInput,
  KnowledgeReviewAction,
  MemoryEditInput,
  MemoryReviewAction,
  RecommendationReviewAction
} from "@orbit/db";
import {
  editKnowledgeArtifact,
  editMemory,
  openOrbitDatabase,
  reviewKnowledgeArtifact,
  reviewMemory,
  reviewRecommendation
} from "@orbit/db";
import { getCliConfig } from "../config";

export function runKnowledgeReviewAction(
  id: string,
  action: KnowledgeReviewAction
): KnowledgeActionResult {
  return withDatabase((db) => reviewKnowledgeArtifact(db, id, action));
}

export function runKnowledgeEdit(id: string, input: KnowledgeEditInput) {
  return withDatabase((db) => editKnowledgeArtifact(db, id, input));
}

export function runMemoryReviewAction(id: string, action: MemoryReviewAction) {
  return withDatabase((db) => reviewMemory(db, id, action));
}

export function runMemoryEdit(id: string, input: MemoryEditInput) {
  return withDatabase((db) => editMemory(db, id, input));
}

export function runRecommendationReviewAction(
  id: string,
  action: RecommendationReviewAction,
  options: { snoozeUntil?: string | undefined } = {}
) {
  return withDatabase((db) => reviewRecommendation(db, id, action, options));
}

function withDatabase<T>(work: (db: ReturnType<typeof openOrbitDatabase>["db"]) => T): T {
  const config = getCliConfig();
  const database = openOrbitDatabase({ orbitHome: config.orbitHome });
  try {
    return work(database.db);
  } finally {
    database.close();
  }
}
