import type {
  KnowledgeActionResult,
  KnowledgeEditInput,
  KnowledgeReviewAction,
  MemoryEditInput,
  MemoryReviewAction,
  RecommendationReviewAction
} from "@orbit/db";
import {
  deleteActivitySession,
  deleteMemory,
  editKnowledgeArtifact,
  editMemory,
  openOrbitDatabase,
  rollbackMemoryVersion,
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

export function runMemoryDelete(id: string) {
  return withDatabase((db) => {
    deleteMemory(db, id);
    return { id, deleted: true };
  });
}

export function runMemoryRollback(id: string) {
  return withDatabase((db) => rollbackMemoryVersion(db, id));
}

export function runActivityDelete(id: string) {
  return withDatabase((db) => {
    deleteActivitySession(db, id);
    return { id, deleted: true };
  });
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
