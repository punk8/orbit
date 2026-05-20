import type { ActivitySession, KnowledgeArtifact, Memory, Recommendation } from "../index";

export interface TodayContext {
  date: string;
  activitySessions: ActivitySession[];
  knowledgeArtifacts: KnowledgeArtifact[];
  memories: Memory[];
  recommendations: Recommendation[];
}

export function buildTodayContext(input: {
  date: string;
  activitySessions: ActivitySession[];
  knowledgeArtifacts: KnowledgeArtifact[];
  memories: Memory[];
  recommendations: Recommendation[];
}): TodayContext {
  return {
    date: input.date,
    activitySessions: input.activitySessions.filter((session) =>
      session.startAt.startsWith(input.date)
    ),
    knowledgeArtifacts: input.knowledgeArtifacts.filter((artifact) =>
      artifact.createdAt.startsWith(input.date)
    ),
    memories: input.memories.filter((memory) => memory.createdAt.startsWith(input.date)),
    recommendations: input.recommendations.filter((recommendation) =>
      recommendation.createdAt.startsWith(input.date)
    )
  };
}
