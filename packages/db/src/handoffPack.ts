import {
  buildHandoffPack,
  getLocalDateKey,
  type Event,
  type HandoffEventSafety,
  type HandoffPack,
  type KnowledgeArtifact,
  type SourceRecord
} from "@orbit/core";
import type { OrbitDatabase } from "./connection";
import { ActivityRepository } from "./repositories/activityRepository";
import { AuditRepository } from "./repositories/auditRepository";
import { EventRepository } from "./repositories/eventRepository";
import { KnowledgeRepository } from "./repositories/knowledgeRepository";
import { MemoryRepository } from "./repositories/memoryRepository";
import { RecommendationRepository } from "./repositories/recommendationRepository";
import { SourceRepository } from "./repositories/sourceRepository";

export function buildTodayHandoffPack(
  database: OrbitDatabase,
  options: { date?: string; generatedAt?: string } = {}
): HandoffPack {
  const repositories = makeRepositories(database);
  const date = options.date ?? getLocalDateKey();
  const activitySessions = repositories.activity
    .listActivitySessions()
    .filter((session) => matchesLocalDate(date, session.startAt) || matchesLocalDate(date, session.endAt));
  const knowledgeArtifacts = repositories.knowledge
    .listKnowledgeArtifacts()
    .filter((artifact) => knowledgeMatchesDate(artifact, date));
  const memories = repositories.memory.listMemories();
  const recommendations = repositories.recommendations
    .listRecommendations()
    .filter((recommendation) => matchesLocalDate(date, recommendation.createdAt));

  const pack = buildHandoffPack({
    kind: "today",
    objective: `Continue work for ${date}`,
    date,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    activitySessions,
    knowledgeArtifacts,
    memories,
    recommendations,
    eventSafety: buildEventSafety(repositories.events.listEvents(), repositories.sources.listSources())
  });
  logHandoffGeneration(repositories.audit, pack);
  return pack;
}

export function buildProjectHandoffPack(
  database: OrbitDatabase,
  project: string,
  options: { generatedAt?: string } = {}
): HandoffPack {
  const repositories = makeRepositories(database);
  const events = repositories.events.listEvents();
  const activitySessions = repositories.activity
    .listActivitySessions()
    .filter((session) => session.project === project);
  const knowledgeArtifacts = repositories.knowledge
    .listKnowledgeArtifacts()
    .filter((artifact) => artifact.metadata.projects.includes(project));
  const memories = repositories.memory
    .listMemories()
    .filter((memory) => memory.scope.project === project);
  const projectEventIds = new Set(
    events
      .filter((event) => event.context.project === project || event.context.repository === project)
      .map((event) => event.id)
  );
  const projectActivityIds = new Set(activitySessions.map((session) => session.id));
  const projectArtifactIds = new Set(knowledgeArtifacts.map((artifact) => artifact.id));
  const recommendations = repositories.recommendations
    .listRecommendations()
    .filter((recommendation) =>
      recommendation.evidence.some(
        (ref) =>
          (ref.eventId && projectEventIds.has(ref.eventId)) ||
          (ref.activitySessionId && projectActivityIds.has(ref.activitySessionId)) ||
          (ref.artifactId && projectArtifactIds.has(ref.artifactId))
      )
    );

  const pack = buildHandoffPack({
    kind: "project",
    objective: `Continue project ${project}`,
    project,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    activitySessions,
    knowledgeArtifacts,
    memories,
    recommendations,
    eventSafety: buildEventSafety(events, repositories.sources.listSources())
  });
  logHandoffGeneration(repositories.audit, pack);
  return pack;
}

function makeRepositories(database: OrbitDatabase) {
  return {
    activity: new ActivityRepository(database.db),
    audit: new AuditRepository(database.db),
    events: new EventRepository(database.db),
    knowledge: new KnowledgeRepository(database.db),
    memory: new MemoryRepository(database.db),
    recommendations: new RecommendationRepository(database.db),
    sources: new SourceRepository(database.db)
  };
}

function buildEventSafety(
  events: Event[],
  sources: SourceRecord[]
): Map<string, HandoffEventSafety> {
  const sourcesById = new Map(sources.map((source) => [source.id, source]));
  return new Map(
    events.map((event) => {
      const source = sourcesById.get(event.source.adapterId);
      return [
        event.id,
        {
          eventId: event.id,
          sourceAdapterId: event.source.adapterId,
          sourceKind: event.source.kind,
          sourcePointer: event.source.pointer,
          timestamp: event.occurredAt,
          sensitivity: event.privacy.sensitivity,
          redactionState: event.privacy.redactionState,
          canExportToAgent: source?.permissionScope.canExportToAgent ?? false
        }
      ];
    })
  );
}

function logHandoffGeneration(audit: AuditRepository, pack: HandoffPack): void {
  audit.log("handoff.generate", "handoff_pack", pack.id, {
    kind: pack.kind,
    date: pack.date,
    project: pack.project,
    included: {
      activity: pack.recentActivity.length,
      knowledge: pack.confirmedKnowledge.length,
      memories: pack.activeMemories.length,
      recommendations: pack.recommendedNextActions.length
    },
    excluded: pack.excluded.length
  });
}

function knowledgeMatchesDate(artifact: KnowledgeArtifact, date: string): boolean {
  const window = artifact.metadata.timeWindow;
  if (window) {
    return matchesLocalDate(date, window.startAt) || matchesLocalDate(date, window.endAt);
  }
  return matchesLocalDate(date, artifact.createdAt);
}

function matchesLocalDate(date: string, timestamp: string): boolean {
  return getLocalDateKey(new Date(timestamp)) === date;
}
