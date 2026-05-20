import {
  buildActivitySessions,
  draftKnowledgeArtifact,
  extractMemoryCandidates,
  generateRecommendations
} from "@orbit/core";
import type { OrbitDatabase } from "@orbit/db";
import {
  ActivityRepository,
  EventRepository,
  KnowledgeRepository,
  MemoryRepository,
  RecommendationRepository
} from "@orbit/db";

export interface SemanticPipelineResult {
  events: number;
  activitySessions: {
    generated: number;
    total: number;
  };
  knowledgeArtifacts: {
    generated: number;
    total: number;
  };
  memories: {
    generated: number;
    total: number;
  };
  recommendations: {
    generated: number;
    total: number;
  };
}

export function runSemanticPipeline(database: OrbitDatabase): SemanticPipelineResult {
  const eventRepository = new EventRepository(database.db);
  const activityRepository = new ActivityRepository(database.db);
  const knowledgeRepository = new KnowledgeRepository(database.db);
  const memoryRepository = new MemoryRepository(database.db);
  const recommendationRepository = new RecommendationRepository(database.db);

  const events = eventRepository.listEvents();
  const sessions = buildActivitySessions(events);
  for (const session of sessions) {
    activityRepository.upsertActivitySession(session);
  }

  const eventById = new Map(events.map((event) => [event.id, event]));
  const persistedSessions = activityRepository.listActivitySessions();
  const draftArtifacts = persistedSessions.map((session) =>
    draftKnowledgeArtifact({
      session,
      events: session.eventIds
        .map((eventId) => eventById.get(eventId))
        .filter((event) => event !== undefined)
    })
  );

  for (const artifact of draftArtifacts) {
    const existing = knowledgeRepository.getKnowledgeArtifact(artifact.id);
    if (!existing || existing.status === "draft") {
      knowledgeRepository.upsertKnowledgeArtifact(artifact);
    }
  }

  const persistedArtifacts = knowledgeRepository.listKnowledgeArtifacts();
  const memoryCandidates = extractMemoryCandidates(persistedArtifacts);
  for (const memory of memoryCandidates) {
    const existing = memoryRepository.getMemory(memory.id);
    if (!existing || existing.status === "draft" || existing.status === "needs_review") {
      memoryRepository.upsertMemory(memory);
    }
  }

  const persistedMemories = memoryRepository.listMemories();
  const recommendationCandidates = generateRecommendations({
    events,
    sessions: persistedSessions,
    artifacts: persistedArtifacts,
    memories: persistedMemories
  });
  for (const recommendation of recommendationCandidates) {
    const existing = recommendationRepository.getRecommendation(recommendation.id);
    if (!existing || existing.status === "new") {
      recommendationRepository.upsertRecommendation(recommendation);
    }
  }

  return {
    events: events.length,
    activitySessions: {
      generated: sessions.length,
      total: activityRepository.countActivitySessions()
    },
    knowledgeArtifacts: {
      generated: draftArtifacts.length,
      total: knowledgeRepository.countKnowledgeArtifacts()
    },
    memories: {
      generated: memoryCandidates.length,
      total: memoryRepository.countMemories()
    },
    recommendations: {
      generated: recommendationCandidates.length,
      total: recommendationRepository.countRecommendations()
    }
  };
}
