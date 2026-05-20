import type {
  ActivitySession,
  KnowledgeArtifact,
  Memory,
  Recommendation,
  SourceRecord,
  TodayContext
} from "@orbit/core";

export interface DesktopSnapshot {
  orbitHome: string;
  dbPath: string;
  date: string;
  counts: {
    sources: number;
    events: number;
    activitySessions: number;
    knowledgeArtifacts: number;
    memories: number;
    recommendations: number;
  };
  sources: SourceRecord[];
  activitySessions: ActivitySession[];
  knowledgeArtifacts: KnowledgeArtifact[];
  memories: Memory[];
  recommendations: Recommendation[];
  today: TodayContext;
  settings: {
    localOnly: boolean;
    aiProvider: string;
    externalActionsEnabled: boolean;
    screenCaptureEnabled: boolean;
  };
}

export interface OrbitDesktopApi {
  getSnapshot(): Promise<DesktopSnapshot>;
}

declare global {
  interface Window {
    orbit: OrbitDesktopApi;
  }
}
