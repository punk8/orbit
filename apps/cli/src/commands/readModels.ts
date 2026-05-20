import { buildTodayContext, getLocalDateKey } from "@orbit/core";
import type {
  ActivitySession,
  KnowledgeArtifact,
  Memory,
  Recommendation,
  TodayContext
} from "@orbit/core";
import {
  ActivityRepository,
  EventRepository,
  KnowledgeRepository,
  MemoryRepository,
  openOrbitDatabase,
  RecommendationRepository
} from "@orbit/db";
import { getCliConfig } from "../config";

export interface ProjectContext {
  project: string;
  activitySessions: ActivitySession[];
  knowledgeArtifacts: KnowledgeArtifact[];
  memories: Memory[];
  recommendations: Recommendation[];
}

export function listActivitySessions(): ActivitySession[] {
  return withDatabase((repositories) => repositories.activity.listActivitySessions());
}

export function getActivitySession(id: string): ActivitySession | undefined {
  return withDatabase((repositories) => repositories.activity.getActivitySession(id));
}

export function listKnowledgeArtifacts(): KnowledgeArtifact[] {
  return withDatabase((repositories) => repositories.knowledge.listKnowledgeArtifacts());
}

export function getKnowledgeArtifact(id: string): KnowledgeArtifact | undefined {
  return withDatabase((repositories) => repositories.knowledge.getKnowledgeArtifact(id));
}

export function searchKnowledgeArtifacts(query: string): KnowledgeArtifact[] {
  return withDatabase((repositories) =>
    query.trim()
      ? repositories.knowledge.searchKnowledge(query)
      : repositories.knowledge.listKnowledgeArtifacts()
  );
}

export function listMemories(): Memory[] {
  return withDatabase((repositories) => repositories.memory.listMemories());
}

export function getMemory(id: string): Memory | undefined {
  return withDatabase((repositories) => repositories.memory.getMemory(id));
}

export function searchMemories(query: string): Memory[] {
  return withDatabase((repositories) =>
    query.trim() ? repositories.memory.searchMemory(query) : repositories.memory.listMemories()
  );
}

export function listRecommendations(): Recommendation[] {
  return withDatabase((repositories) => repositories.recommendation.listRecommendations());
}

export function getRecommendation(id: string): Recommendation | undefined {
  return withDatabase((repositories) => repositories.recommendation.getRecommendation(id));
}

export function getTodayContext(date = getLocalDateKey()): TodayContext {
  return withDatabase((repositories) =>
    buildTodayContext({
      date,
      activitySessions: repositories.activity.listActivitySessions(),
      knowledgeArtifacts: repositories.knowledge
        .listKnowledgeArtifacts()
        .filter((artifact) => artifact.status === "confirmed"),
      memories: repositories.memory.listMemories().filter((memory) => memory.status === "confirmed"),
      recommendations: repositories.recommendation
        .listRecommendations()
        .filter((recommendation) => recommendation.evidence.length > 0)
    })
  );
}

export function getProjectContext(project: string): ProjectContext {
  return withDatabase((repositories) => {
    const activitySessions = repositories.activity
      .listActivitySessions()
      .filter((session) => session.project === project);
    const knowledgeArtifacts = repositories.knowledge
      .listKnowledgeArtifacts()
      .filter(
        (artifact) => artifact.status === "confirmed" && artifact.metadata.projects.includes(project)
      );
    const memories = repositories.memory
      .listMemories()
      .filter((memory) => memory.status === "confirmed" && memory.scope.project === project);
    const projectEventIds = new Set(
      repositories.event
        .listEvents()
        .filter(
          (event) => event.context.project === project || event.context.repository === project
        )
        .map((event) => event.id)
    );
    const recommendations = repositories.recommendation
      .listRecommendations()
      .filter((recommendation) =>
        recommendation.evidence.length > 0 &&
        recommendation.evidence.some(
          (ref) =>
            (ref.eventId && projectEventIds.has(ref.eventId)) ||
            (ref.activitySessionId &&
              activitySessions.some((session) => session.id === ref.activitySessionId)) ||
            (ref.artifactId &&
              knowledgeArtifacts.some((artifact) => artifact.id === ref.artifactId))
        )
      );

    return {
      project,
      activitySessions,
      knowledgeArtifacts,
      memories,
      recommendations
    };
  });
}

type RepositorySet = {
  activity: ActivityRepository;
  event: EventRepository;
  knowledge: KnowledgeRepository;
  memory: MemoryRepository;
  recommendation: RecommendationRepository;
};

function withDatabase<T>(read: (repositories: RepositorySet) => T): T {
  const config = getCliConfig();
  const database = openOrbitDatabase({ orbitHome: config.orbitHome });
  try {
    return read({
      activity: new ActivityRepository(database.db),
      event: new EventRepository(database.db),
      knowledge: new KnowledgeRepository(database.db),
      memory: new MemoryRepository(database.db),
      recommendation: new RecommendationRepository(database.db)
    });
  } finally {
    database.close();
  }
}
