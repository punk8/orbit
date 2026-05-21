import type {
  ActivitySession,
  Event,
  HandoffPack,
  KnowledgeArtifact,
  KnowledgeArtifactType,
  Memory,
  MemoryKind,
  PerceptionControlPlaneStatus,
  PerceptionProviderKind,
  PerceptionProviderTask,
  PerceptionSourceKind,
  PerceptionSourcePolicyPatch,
  PerceptionSourceRuntimeAction,
  ObservationStatus,
  Recommendation,
  SourceRecord,
  TodayContext
} from "@orbit/core";
import type {
  KnowledgeReviewAction,
  MemoryEditInput,
  MemoryReviewAction,
  RecommendationReviewAction
} from "@orbit/db";
import type { KnowledgeEditInput } from "@orbit/db";

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
  sourceCursors: Record<string, boolean>;
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
  observation: ObservationStatus;
  perception: PerceptionControlPlaneStatus;
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

export interface DesktopActivitySessionDetail {
  session: ActivitySession;
  events: Event[];
  linkedKnowledge: KnowledgeArtifact[];
  linkedMemories: Memory[];
  linkedRecommendations: Recommendation[];
}

export interface DesktopKnowledgeSearchFilters {
  status?: KnowledgeArtifact["status"] | undefined;
  type?: KnowledgeArtifactType | undefined;
  project?: string | undefined;
  sourceKind?: string | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
}

export interface DesktopKnowledgeArtifactDetail {
  artifact: KnowledgeArtifact;
  sourceSessions: ActivitySession[];
  relatedMemories: Memory[];
}

export interface DesktopMemorySearchFilters {
  status?: Memory["status"] | undefined;
  kind?: MemoryKind | undefined;
  project?: string | undefined;
  sourceKind?: string | undefined;
  tag?: string | undefined;
}

export interface DesktopMemoryDetail {
  memory: Memory;
  sourceKnowledge: KnowledgeArtifact[];
  sourceSessions: ActivitySession[];
}

export interface DesktopRecommendationDetail {
  recommendation: Recommendation;
  events: Event[];
  sourceSessions: ActivitySession[];
  knowledgeArtifacts: KnowledgeArtifact[];
  memories: Memory[];
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

export type DesktopHandoffRequest =
  | { kind: "today"; date?: string }
  | { kind: "project"; project: string };

export interface DesktopHandoffResult extends DesktopActionResult {
  handoff: HandoffPack;
  markdown: string;
}

export interface OrbitDesktopApi {
  getSnapshot(): Promise<DesktopSnapshot>;
  getActivitySessionDetail(id: string): Promise<DesktopActivitySessionDetail>;
  searchKnowledge(
    query: string,
    filters?: DesktopKnowledgeSearchFilters
  ): Promise<KnowledgeArtifact[]>;
  getKnowledgeArtifactDetail(id: string): Promise<DesktopKnowledgeArtifactDetail>;
  editKnowledge(id: string, patch: KnowledgeEditInput): Promise<DesktopSnapshot>;
  reviewKnowledge(id: string, action: KnowledgeReviewAction): Promise<DesktopSnapshot>;
  searchMemory(query: string, filters?: DesktopMemorySearchFilters): Promise<Memory[]>;
  getMemoryDetail(id: string): Promise<DesktopMemoryDetail>;
  editMemory(id: string, patch: MemoryEditInput): Promise<DesktopSnapshot>;
  reviewMemory(id: string, action: MemoryReviewAction): Promise<DesktopSnapshot>;
  getRecommendationDetail(id: string): Promise<DesktopRecommendationDetail>;
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
  updatePerceptionSourceRuntime(
    sourceKind: PerceptionSourceKind,
    action: PerceptionSourceRuntimeAction
  ): Promise<DesktopSnapshot>;
  updatePerceptionSourcePolicy(
    sourceKind: PerceptionSourceKind,
    patch: PerceptionSourcePolicyPatch
  ): Promise<DesktopSnapshot>;
  updatePerceptionProviderRoute(
    task: PerceptionProviderTask,
    provider: PerceptionProviderKind
  ): Promise<DesktopSnapshot>;
  setupSource(kind: SourceSetupKind, path?: string): Promise<DesktopActionResult>;
  reconfigureSource(
    sourceId: string,
    kind: SourceSetupKind,
    path?: string
  ): Promise<DesktopActionResult>;
  deleteSource(sourceId: string): Promise<DesktopActionResult>;
  resetSourceCursor(sourceId: string): Promise<DesktopActionResult>;
  cleanupLegacyEventPrivacy(): Promise<DesktopActionResult>;
  cleanupPerceptionSidecars(): Promise<DesktopActionResult>;
  generateHandoff(input: DesktopHandoffRequest): Promise<DesktopHandoffResult>;
  reindexLocalData(): Promise<DesktopActionResult>;
  clearLocalData(): Promise<DesktopActionResult>;
  exportContext(): Promise<DesktopActionResult>;
  testAIProvider(config: DesktopAIProviderTestConfig): Promise<DesktopAIProviderTestResult>;
  startObservation(): Promise<DesktopSnapshot>;
  pauseObservation(): Promise<DesktopSnapshot>;
  resumeObservation(): Promise<DesktopSnapshot>;
  stopObservation(): Promise<DesktopSnapshot>;
  onSnapshotChanged(callback: () => void): () => void;
}

declare global {
  interface Window {
    orbit: OrbitDesktopApi;
  }
}
