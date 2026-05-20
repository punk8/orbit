import type Database from "better-sqlite3";
import { extractMemoryCandidates } from "@orbit/core";
import type { KnowledgeArtifact, Memory, Recommendation, ReviewStatus } from "@orbit/core";
import { AuditRepository } from "./repositories/auditRepository";
import { KnowledgeRepository } from "./repositories/knowledgeRepository";
import { MemoryRepository } from "./repositories/memoryRepository";
import { RecommendationRepository } from "./repositories/recommendationRepository";

export type KnowledgeReviewAction = "confirm" | "reject" | "archive";
export type MemoryReviewAction = "confirm" | "reject" | "archive";
export type RecommendationReviewAction = "accept" | "dismiss" | "snooze" | "resolve";

export interface KnowledgeEditInput {
  title?: string | undefined;
  description?: string | undefined;
  markdown?: string | undefined;
  keyInsights?: string[] | undefined;
}

export interface MemoryEditInput {
  title?: string | undefined;
  body?: string | undefined;
  tags?: string[] | undefined;
}

export interface KnowledgeActionResult {
  artifact: KnowledgeArtifact;
  generatedMemories: Memory[];
}

export function reviewKnowledgeArtifact(
  db: Database.Database,
  id: string,
  action: KnowledgeReviewAction
): KnowledgeActionResult {
  const repository = new KnowledgeRepository(db);
  const artifact = requireKnowledge(repository, id);
  const previousStatus = artifact.status;
  const updated = touchKnowledge({
    ...artifact,
    status: knowledgeActionToStatus(action)
  });
  repository.upsertKnowledgeArtifact(updated);

  const generatedMemories =
    updated.status === "confirmed" ? generateMemoryCandidatesForKnowledge(db, updated) : [];
  logAudit(db, `knowledge.${action}`, "knowledge_artifact", id, {
    previousStatus,
    nextStatus: updated.status,
    generatedMemoryIds: generatedMemories.map((memory) => memory.id)
  });

  return { artifact: updated, generatedMemories };
}

export function editKnowledgeArtifact(
  db: Database.Database,
  id: string,
  input: KnowledgeEditInput
): KnowledgeArtifact {
  const repository = new KnowledgeRepository(db);
  const artifact = requireKnowledge(repository, id);
  const changedFields = Object.entries(input)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);

  const updated = touchKnowledge({
    ...artifact,
    title: input.title ?? artifact.title,
    content: {
      ...artifact.content,
      description: input.description ?? artifact.content.description,
      markdown: input.markdown ?? artifact.content.markdown,
      keyInsights: input.keyInsights ?? artifact.content.keyInsights
    }
  });
  repository.upsertKnowledgeArtifact(updated);
  logAudit(db, "knowledge.edit", "knowledge_artifact", id, { changedFields });
  return updated;
}

export function reviewMemory(
  db: Database.Database,
  id: string,
  action: MemoryReviewAction
): Memory {
  const repository = new MemoryRepository(db);
  const memory = requireMemory(repository, id);
  const previousStatus = memory.status;
  const updated = touchMemory({
    ...memory,
    status: memoryActionToStatus(action),
    lastReviewedAt: new Date().toISOString()
  });
  repository.upsertMemory(updated);
  logAudit(db, `memory.${action}`, "memory", id, {
    previousStatus,
    nextStatus: updated.status
  });
  return updated;
}

export function editMemory(db: Database.Database, id: string, input: MemoryEditInput): Memory {
  const repository = new MemoryRepository(db);
  const memory = requireMemory(repository, id);
  const changedFields = Object.entries(input)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);
  const updated = touchMemory({
    ...memory,
    title: input.title ?? memory.title,
    body: input.body ?? memory.body,
    tags: input.tags ?? memory.tags
  });
  repository.upsertMemory(updated);
  logAudit(db, "memory.edit", "memory", id, { changedFields });
  return updated;
}

export function reviewRecommendation(
  db: Database.Database,
  id: string,
  action: RecommendationReviewAction,
  options: { snoozeUntil?: string | undefined } = {}
): Recommendation {
  const repository = new RecommendationRepository(db);
  const recommendation = requireRecommendation(repository, id);
  const previousStatus = recommendation.status;
  const updated: Recommendation = {
    ...recommendation,
    status: recommendationActionToStatus(action)
  };
  if (action === "snooze") {
    if (options.snoozeUntil) {
      updated.dueAt = options.snoozeUntil;
    } else {
      delete updated.dueAt;
    }
  }
  repository.upsertRecommendation(updated);
  logAudit(db, `recommendation.${action}`, "recommendation", id, {
    previousStatus,
    nextStatus: updated.status,
    snoozeUntil: options.snoozeUntil
  });
  return updated;
}

function generateMemoryCandidatesForKnowledge(
  db: Database.Database,
  artifact: KnowledgeArtifact
): Memory[] {
  const repository = new MemoryRepository(db);
  const audit = new AuditRepository(db);
  const candidates = extractMemoryCandidates([artifact]);
  const inserted: Memory[] = [];

  for (const candidate of candidates) {
    if (repository.getMemory(candidate.id)) {
      continue;
    }
    repository.upsertMemory(candidate);
    audit.log("memory.generate_candidate", "memory", candidate.id, {
      artifactId: artifact.id,
      status: candidate.status
    });
    inserted.push(candidate);
  }

  return inserted;
}

function requireKnowledge(repository: KnowledgeRepository, id: string): KnowledgeArtifact {
  const artifact = repository.getKnowledgeArtifact(id);
  if (!artifact) {
    throw new Error(`Knowledge Artifact not found: ${id}`);
  }
  return artifact;
}

function requireMemory(repository: MemoryRepository, id: string): Memory {
  const memory = repository.getMemory(id);
  if (!memory) {
    throw new Error(`Memory not found: ${id}`);
  }
  return memory;
}

function requireRecommendation(repository: RecommendationRepository, id: string): Recommendation {
  const recommendation = repository.getRecommendation(id);
  if (!recommendation) {
    throw new Error(`Recommendation not found: ${id}`);
  }
  return recommendation;
}

function knowledgeActionToStatus(action: KnowledgeReviewAction): ReviewStatus {
  switch (action) {
    case "confirm":
      return "confirmed";
    case "reject":
      return "rejected";
    case "archive":
      return "archived";
  }
}

function memoryActionToStatus(action: MemoryReviewAction): ReviewStatus {
  return knowledgeActionToStatus(action);
}

function recommendationActionToStatus(
  action: RecommendationReviewAction
): Recommendation["status"] {
  switch (action) {
    case "accept":
      return "accepted";
    case "dismiss":
      return "dismissed";
    case "snooze":
      return "snoozed";
    case "resolve":
      return "resolved";
  }
}

function touchKnowledge(artifact: KnowledgeArtifact): KnowledgeArtifact {
  return { ...artifact, updatedAt: new Date().toISOString() };
}

function touchMemory(memory: Memory): Memory {
  return { ...memory, updatedAt: new Date().toISOString() };
}

function logAudit(
  db: Database.Database,
  operation: string,
  objectType: string,
  objectId: string,
  details: unknown
): void {
  new AuditRepository(db).log(operation, objectType, objectId, details);
}
