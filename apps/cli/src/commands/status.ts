import {
  ActivityRepository,
  EventRepository,
  getAppliedMigrations,
  KnowledgeRepository,
  MemoryRepository,
  openOrbitDatabase,
  RecommendationRepository,
  SourceRepository
} from "@orbit/db";
import { getCliConfig } from "../config";

export interface StatusResult {
  orbitHome: string;
  dbPath: string;
  migrations: string[];
  counts: {
    sources: number;
    events: number;
    activitySessions: number;
    knowledgeArtifacts: number;
    memories: number;
    recommendations: number;
  };
}

export function getStatus(): StatusResult {
  const config = getCliConfig();
  const database = openOrbitDatabase({ orbitHome: config.orbitHome });
  try {
    return {
      orbitHome: database.orbitHome,
      dbPath: database.dbPath,
      migrations: getAppliedMigrations(database.db),
      counts: {
        sources: new SourceRepository(database.db).countSources(),
        events: new EventRepository(database.db).countEvents(),
        activitySessions: new ActivityRepository(database.db).countActivitySessions(),
        knowledgeArtifacts: new KnowledgeRepository(database.db).countKnowledgeArtifacts(),
        memories: new MemoryRepository(database.db).countMemories(),
        recommendations: new RecommendationRepository(database.db).countRecommendations()
      }
    };
  } finally {
    database.close();
  }
}
