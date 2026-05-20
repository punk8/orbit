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
  matchesDate?: (timestamp: string) => boolean;
}): TodayContext {
  const matchesDate =
    input.matchesDate ?? ((timestamp: string) => isInLocalDate(input.date, timestamp));
  return {
    date: input.date,
    activitySessions: input.activitySessions.filter((session) => matchesDate(session.startAt)),
    knowledgeArtifacts: input.knowledgeArtifacts.filter((artifact) =>
      matchesDate(artifact.createdAt)
    ),
    memories: input.memories.filter((memory) => matchesDate(memory.createdAt)),
    recommendations: input.recommendations.filter((recommendation) =>
      matchesDate(recommendation.createdAt)
    )
  };
}

export function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isInLocalDate(dateKey: string, timestamp: string): boolean {
  const date = new Date(timestamp);
  return !Number.isNaN(date.getTime()) && getLocalDateKey(date) === dateKey;
}
