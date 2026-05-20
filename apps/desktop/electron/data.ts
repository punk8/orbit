import { buildTodayContext } from "@orbit/core";
import {
  ActivityRepository,
  EventRepository,
  KnowledgeRepository,
  MemoryRepository,
  openOrbitDatabase,
  RecommendationRepository,
  SourceRepository
} from "@orbit/db";
import type { DesktopSnapshot } from "../src/orbitApi";

export function readDesktopSnapshot(date = new Date().toISOString().slice(0, 10)): DesktopSnapshot {
  const database = openOrbitDatabase();
  try {
    const sourceRepository = new SourceRepository(database.db);
    const eventRepository = new EventRepository(database.db);
    const activityRepository = new ActivityRepository(database.db);
    const knowledgeRepository = new KnowledgeRepository(database.db);
    const memoryRepository = new MemoryRepository(database.db);
    const recommendationRepository = new RecommendationRepository(database.db);

    const activitySessions = activityRepository.listActivitySessions();
    const knowledgeArtifacts = knowledgeRepository.listKnowledgeArtifacts();
    const memories = memoryRepository.listMemories();
    const recommendations = recommendationRepository.listRecommendations();
    const today = buildTodayContext({
      date,
      activitySessions,
      knowledgeArtifacts,
      memories,
      recommendations
    });

    return {
      orbitHome: database.orbitHome,
      dbPath: database.dbPath,
      date,
      counts: {
        sources: sourceRepository.countSources(),
        events: eventRepository.countEvents(),
        activitySessions: activityRepository.countActivitySessions(),
        knowledgeArtifacts: knowledgeRepository.countKnowledgeArtifacts(),
        memories: memoryRepository.countMemories(),
        recommendations: recommendationRepository.countRecommendations()
      },
      sources: sourceRepository.listSources(),
      activitySessions,
      knowledgeArtifacts,
      memories,
      recommendations,
      today,
      settings: {
        localOnly: true,
        aiProvider: "mock_provider",
        externalActionsEnabled: false,
        screenCaptureEnabled: false
      }
    };
  } finally {
    database.close();
  }
}
