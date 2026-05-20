import type {
  ActivitySession,
  KnowledgeArtifact,
  Memory,
  Recommendation,
  SourceRecord,
  TodayContext
} from "@orbit/core";
import type {
  KnowledgeReviewAction,
  MemoryReviewAction,
  RecommendationReviewAction
} from "@orbit/db";

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
    aiBaseUrl?: string;
    aiModel?: string;
    aiApiKeyConfigured: boolean;
    externalActionsEnabled: boolean;
    visualContextEnabled: boolean;
    menuBarEnabled: boolean;
    launchAtLoginEnabled: boolean;
    language: DesktopLanguage;
    configuredDatabasePath?: string;
    sourceSetupCompleted: boolean;
  };
}

export type DesktopSettingKey =
  | "desktop.menuBarEnabled"
  | "desktop.launchAtLoginEnabled"
  | "desktop.language"
  | "storage.configuredDatabasePath"
  | "ai.providerKind"
  | "ai.baseUrl"
  | "ai.model"
  | "ai.apiKey"
  | "sources.setupCompleted";

export type DesktopLanguage = "system" | "en" | "zh-CN";

export type DesktopAIProviderKind = "disabled" | "mock" | "openai-compatible";

export type SourceSetupKind = "fixtures" | "codex" | "local_agent" | "seatalk";

export interface DesktopActionResult {
  snapshot: DesktopSnapshot;
  message: string;
  exportPath?: string;
  warnings?: string[];
}

export interface OrbitDesktopApi {
  getSnapshot(): Promise<DesktopSnapshot>;
  reviewKnowledge(id: string, action: KnowledgeReviewAction): Promise<DesktopSnapshot>;
  reviewMemory(id: string, action: MemoryReviewAction): Promise<DesktopSnapshot>;
  reviewRecommendation(
    id: string,
    action: RecommendationReviewAction,
    options?: { snoozeUntil?: string | undefined }
  ): Promise<DesktopSnapshot>;
  updateSetting(key: DesktopSettingKey, value: unknown): Promise<DesktopSnapshot>;
  setupSource(kind: SourceSetupKind, path?: string): Promise<DesktopActionResult>;
  reindexLocalData(): Promise<DesktopActionResult>;
  clearLocalData(): Promise<DesktopActionResult>;
  exportContext(): Promise<DesktopActionResult>;
}

declare global {
  interface Window {
    orbit: OrbitDesktopApi;
  }
}
