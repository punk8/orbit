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
  sourceAdapterConfigs: Record<string, DesktopSourceAdapterConfig>;
  activitySessions: ActivitySession[];
  knowledgeArtifacts: KnowledgeArtifact[];
  memories: Memory[];
  recommendations: Recommendation[];
  today: TodayContext;
  runtime: {
    status: DesktopRuntimeStatus;
    collectionPaused: boolean;
    lastRunAt?: string;
    lastCompletedAt?: string;
    lastError?: string;
  };
  settings: {
    localOnly: boolean;
    aiProvider: string;
    aiBaseUrl?: string;
    aiModel?: string;
    aiMaxTokens: number;
    aiTestMaxTokens: number;
    aiTokenLimitParameter: DesktopOpenAITokenLimitParameter;
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
  | "ai.maxTokens"
  | "ai.testMaxTokens"
  | "ai.tokenLimitParameter"
  | "sources.setupCompleted";

export type DesktopLanguage = "system" | "en" | "zh-CN";

export type DesktopAIProviderKind = "disabled" | "mock" | "openai-compatible";
export type DesktopOpenAITokenLimitParameter = "max_tokens" | "max_completion_tokens";
export type DesktopRuntimeStatus = "idle" | "collecting" | "paused" | "error";
export type DesktopSourceRuntimeAction = "pause" | "resume" | "enable" | "disable";

export type SourceSetupKind = "fixtures" | "codex" | "local_agent" | "seatalk";

export interface DesktopSourceAdapterConfig {
  setupKind: SourceSetupKind;
  path?: string;
  fixturesRoot?: string;
}

export interface DesktopAIProviderTestConfig {
  providerKind?: DesktopAIProviderKind;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  maxTokens?: number | string;
  testMaxTokens?: number | string;
  tokenLimitParameter?: DesktopOpenAITokenLimitParameter;
}

export interface DesktopAIProviderTestResult {
  ok: boolean;
  provider: DesktopAIProviderKind;
  message: string;
  latencyMs: number;
  endpoint?: string;
  model?: string;
}

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
  setCollectionPaused(paused: boolean): Promise<DesktopSnapshot>;
  updateSourceRuntime(
    sourceId: string,
    action: DesktopSourceRuntimeAction
  ): Promise<DesktopSnapshot>;
  setupSource(kind: SourceSetupKind, path?: string): Promise<DesktopActionResult>;
  reindexLocalData(): Promise<DesktopActionResult>;
  clearLocalData(): Promise<DesktopActionResult>;
  exportContext(): Promise<DesktopActionResult>;
  testAIProvider(config: DesktopAIProviderTestConfig): Promise<DesktopAIProviderTestResult>;
  onSnapshotChanged(callback: () => void): () => void;
}

declare global {
  interface Window {
    orbit: OrbitDesktopApi;
  }
}
