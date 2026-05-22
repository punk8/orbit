import {
  buildTodayContext,
  createDefaultObservationStatus,
  defaultProtectedAppRules,
  DESKTOP_OBSERVATION_ADAPTER_ID,
  formatHandoffMarkdown,
  getLocalDateKey,
  ingestEventsFromAdapter,
  normalizeObservationInput,
  type AllowedFolderRule,
  type EvidenceRef,
  type KnowledgeArtifact,
  type Memory,
  type ObservationPermissionStatus,
  type ObservationRuntimeStatus,
  type ObservationStatus,
  type PerceptionProviderKind,
  type PerceptionProviderTask,
  type PerceptionSourceKind,
  type PerceptionSourcePolicyPatch,
  type PerceptionSourceRuntimeAction,
  type SourceAdapter,
  type SourceKind
} from "@orbit/core";
import {
  CapturedTextOcrEngine,
  CodexAdapter,
  DesktopObservationAdapter,
  FixtureAdapter,
  LocalAgentAdapter,
  MacScreenOcrCaptureHelper,
  OCR_OBSERVATION_ADAPTER_ID,
  OcrObservationAdapter,
  SeaTalkAdapter,
  SCREEN_OBSERVATION_ADAPTER_ID,
  ScreenObservationAdapter,
  type ScreenOcrTextResult
} from "@orbit/adapters";
import {
  buildAIProvider,
  buildAIProviderRuntimeRegistry,
  DEFAULT_OPENAI_COMPATIBLE_MAX_TOKENS,
  DEFAULT_OPENAI_COMPATIBLE_TEST_MAX_TOKENS,
  normalizeChatCompletionsUrl,
  readOpenAICompatibleTokenLimitParameter,
  testAIProviderConnection,
  type AIProvider,
  type AIProviderConfig,
  type AIProviderConnectionTestResult,
  type OpenAICompatibleTokenLimitParameter
} from "@orbit/ai";
import {
  ActivityRepository,
  AuditRepository,
  clearLocalData,
  cleanupLegacyEventPrivacy,
  cleanupPerceptionSidecars,
  buildProjectHandoffPack,
  buildTodayHandoffPack,
  EventRepository,
  exportTodayContext,
  KnowledgeRepository,
  MemoryRepository,
  openOrbitDatabase,
  readPerceptionStatus,
  readPerceptionStatusFromSettings,
  reindexLocalDataWithProvider,
  RecommendationRepository,
  SettingsRepository,
  SourceRepository,
  editKnowledgeArtifact,
  editMemory,
  reviewKnowledgeArtifact,
  reviewMemory,
  reviewRecommendation,
  updatePerceptionProviderRoute,
  updatePerceptionSourcePolicy,
  updatePerceptionSourceRuntime,
  writeOrbitRuntimeConfig
} from "@orbit/db";
import { safeStorage } from "electron";
import { detectAccessibilityPermissionStatus } from "./observation/permissionStatus";
import type {
  KnowledgeEditInput,
  KnowledgeReviewAction,
  MemoryEditInput,
  MemoryReviewAction,
  RecommendationReviewAction
} from "@orbit/db";
import { isAbsolute, join, resolve } from "node:path";
import type {
  DesktopActionResult,
  DesktopActivitySessionDetail,
  DesktopAIProviderTestConfig,
  DesktopHandoffRequest,
  DesktopHandoffResult,
  DesktopKnowledgeArtifactDetail,
  DesktopKnowledgeSearchFilters,
  DesktopMemoryDetail,
  DesktopMemorySearchFilters,
  DesktopRecommendationDetail,
  DesktopRuntimeStatus,
  DesktopSourceRuntimeAction,
  DesktopSettingKey,
  DesktopSnapshot,
  SourceSetupKind
} from "../src/orbitApi";

const SETTING_KEYS = {
  menuBarEnabled: "desktop.menuBarEnabled",
  launchAtLoginEnabled: "desktop.launchAtLoginEnabled",
  language: "desktop.language",
  configuredDatabasePath: "storage.configuredDatabasePath",
  aiProviderKind: "ai.providerKind",
  aiBaseUrl: "ai.baseUrl",
  aiModel: "ai.model",
  aiApiKey: "ai.apiKey",
  aiApiKeyCiphertext: "ai.apiKeyCiphertext",
  aiMaxTokens: "ai.maxTokens",
  aiTestMaxTokens: "ai.testMaxTokens",
  aiTokenLimitParameter: "ai.tokenLimitParameter",
  runtimeCollectionPaused: "runtime.collectionPaused",
  runtimeStatus: "runtime.status",
  runtimeLastRunAt: "runtime.lastRunAt",
  runtimeLastCompletedAt: "runtime.lastCompletedAt",
  runtimeLastError: "runtime.lastError",
  observationEnabled: "observation.enabled",
  observationPaused: "observation.paused",
  observationStatus: "observation.status",
  observationLastStartedAt: "observation.lastStartedAt",
  observationLastStoppedAt: "observation.lastStoppedAt",
  observationLastEventAt: "observation.lastEventAt",
  observationLastError: "observation.lastError",
  observationProtectedApps: "observation.protectedApps",
  observationAllowedFolders: "observation.allowedFolders",
  sourceAdapterConfigs: "sources.adapterConfigs",
  sourceSetupCompleted: "sources.setupCompleted"
} as const;

const BACKGROUND_PIPELINE_OPTIONS = {};

interface StoredSourceAdapterConfig {
  setupKind: SourceSetupKind;
  path?: string;
  fixturesRoot?: string;
}

type StoredSourceAdapterConfigs = Record<string, StoredSourceAdapterConfig>;

export function readDesktopSnapshot(date = getLocalDateKey()): DesktopSnapshot {
  const database = openOrbitDatabase();
  try {
    const sourceRepository = new SourceRepository(database.db);
    const eventRepository = new EventRepository(database.db);
    const activityRepository = new ActivityRepository(database.db);
    const knowledgeRepository = new KnowledgeRepository(database.db);
    const memoryRepository = new MemoryRepository(database.db);
    const recommendationRepository = new RecommendationRepository(database.db);
    const settingsRepository = new SettingsRepository(database.db);

    const activitySessions = activityRepository.listActivitySessions();
    const knowledgeArtifacts = knowledgeRepository.listKnowledgeArtifacts();
    const memories = memoryRepository.listMemories();
    const recommendations = recommendationRepository.listRecommendations();
    const events = eventRepository.listEvents();
    const today = buildTodayContext({
      date,
      activitySessions,
      knowledgeArtifacts,
      memories,
      recommendations,
      events
    });

    const perception = readPerceptionStatus(database.db);

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
      sourceAdapterConfigs: readSourceAdapterConfigs(settingsRepository),
      sourceCursors: readSourceCursorPresence(sourceRepository),
      activitySessions,
      knowledgeArtifacts,
      memories,
      recommendations,
      today,
      runtime: readRuntime(settingsRepository),
      observation: readObservationStatus(settingsRepository),
      perception,
      aiProviderRuntime: buildAIProviderRuntimeRegistry({
        aiProviderConfig: buildDesktopAIProviderConfig(settingsRepository),
        perceptionStatus: perception
      }),
      settings: readSettings(settingsRepository)
    };
  } finally {
    database.close();
  }
}

export function getActivitySessionDetailForDesktop(id: string): DesktopActivitySessionDetail {
  const database = openOrbitDatabase();
  try {
    const activityRepository = new ActivityRepository(database.db);
    const eventRepository = new EventRepository(database.db);
    const knowledgeRepository = new KnowledgeRepository(database.db);
    const memoryRepository = new MemoryRepository(database.db);
    const recommendationRepository = new RecommendationRepository(database.db);

    const session = activityRepository.getActivitySession(id);
    if (!session) {
      throw new Error(`Unknown activity session: ${id}`);
    }

    const eventIds = new Set(session.eventIds);
    const sourcePointers = new Set(session.evidence.map((ref) => ref.sourcePointer));
    const matchesActivity = (evidence: EvidenceRef[]): boolean =>
      evidence.some(
        (ref) =>
          ref.activitySessionId === session.id ||
          (ref.eventId ? eventIds.has(ref.eventId) : false) ||
          sourcePointers.has(ref.sourcePointer)
      );

    return {
      session,
      events: eventRepository.listEventsByIds(session.eventIds),
      linkedKnowledge: knowledgeRepository
        .listKnowledgeArtifacts()
        .filter(
          (artifact) =>
            artifact.metadata.sourceSessionIds.includes(session.id) ||
            matchesActivity(artifact.evidence)
        ),
      linkedMemories: memoryRepository
        .listMemories()
        .filter((memory) => matchesActivity(memory.evidence)),
      linkedRecommendations: recommendationRepository
        .listRecommendations()
        .filter((recommendation) => matchesActivity(recommendation.evidence))
    };
  } finally {
    database.close();
  }
}

export function searchKnowledgeForDesktop(
  query = "",
  filters: DesktopKnowledgeSearchFilters = {}
): KnowledgeArtifact[] {
  const database = openOrbitDatabase();
  try {
    const repository = new KnowledgeRepository(database.db);
    const trimmedQuery = query.trim();
    const artifacts = trimmedQuery
      ? repository.searchKnowledge(toFtsQuery(trimmedQuery))
      : repository.listKnowledgeArtifacts();
    return filterKnowledgeArtifacts(artifacts, filters);
  } finally {
    database.close();
  }
}

export function getKnowledgeArtifactDetailForDesktop(id: string): DesktopKnowledgeArtifactDetail {
  const database = openOrbitDatabase();
  try {
    const knowledgeRepository = new KnowledgeRepository(database.db);
    const activityRepository = new ActivityRepository(database.db);
    const memoryRepository = new MemoryRepository(database.db);
    const artifact = knowledgeRepository.getKnowledgeArtifact(id);
    if (!artifact) {
      throw new Error(`Unknown knowledge artifact: ${id}`);
    }

    const sessionIds = new Set(artifact.metadata.sourceSessionIds);
    for (const ref of artifact.evidence) {
      if (ref.activitySessionId) {
        sessionIds.add(ref.activitySessionId);
      }
    }

    const evidenceKeys = evidenceKeySet(artifact.evidence);
    return {
      artifact,
      sourceSessions: [...sessionIds]
        .map((sessionId) => activityRepository.getActivitySession(sessionId))
        .filter((session) => session !== undefined),
      relatedMemories: memoryRepository.listMemories().filter((memory) => {
        if (artifact.memoryCandidateIds?.includes(memory.id)) return true;
        return memory.evidence.some((ref) => evidenceKeys.has(evidenceKey(ref)));
      })
    };
  } finally {
    database.close();
  }
}

export function editKnowledgeForDesktop(id: string, patch: KnowledgeEditInput): DesktopSnapshot {
  const database = openOrbitDatabase();
  try {
    editKnowledgeArtifact(database.db, id, patch);
  } finally {
    database.close();
  }
  return readDesktopSnapshot();
}

export function reviewKnowledgeForDesktop(
  id: string,
  action: KnowledgeReviewAction
): DesktopSnapshot {
  const database = openOrbitDatabase();
  try {
    reviewKnowledgeArtifact(database.db, id, action);
  } finally {
    database.close();
  }
  return readDesktopSnapshot();
}

export function reviewMemoryForDesktop(id: string, action: MemoryReviewAction): DesktopSnapshot {
  const database = openOrbitDatabase();
  try {
    reviewMemory(database.db, id, action);
  } finally {
    database.close();
  }
  return readDesktopSnapshot();
}

export function searchMemoryForDesktop(
  query = "",
  filters: DesktopMemorySearchFilters = {}
): Memory[] {
  const database = openOrbitDatabase();
  try {
    const repository = new MemoryRepository(database.db);
    const trimmedQuery = query.trim();
    const memories = trimmedQuery
      ? repository.searchMemory(toFtsQuery(trimmedQuery))
      : repository.listMemories();
    return filterMemories(memories, filters);
  } finally {
    database.close();
  }
}

export function getMemoryDetailForDesktop(id: string): DesktopMemoryDetail {
  const database = openOrbitDatabase();
  try {
    const memoryRepository = new MemoryRepository(database.db);
    const knowledgeRepository = new KnowledgeRepository(database.db);
    const activityRepository = new ActivityRepository(database.db);
    const memory = memoryRepository.getMemory(id);
    if (!memory) {
      throw new Error(`Unknown memory: ${id}`);
    }

    const evidenceKeys = evidenceKeySet(memory.evidence);
    const sourceKnowledge = knowledgeRepository.listKnowledgeArtifacts().filter((artifact) => {
      if (artifact.memoryCandidateIds?.includes(memory.id)) return true;
      return artifact.evidence.some((ref) => evidenceKeys.has(evidenceKey(ref)));
    });
    const sourceSessionIds = new Set(memory.evidence.flatMap((ref) => ref.activitySessionId ?? []));
    const eventIds = new Set(memory.evidence.flatMap((ref) => ref.eventId ?? []));
    const sourcePointers = new Set(memory.evidence.map((ref) => ref.sourcePointer));
    const sourceSessions = activityRepository.listActivitySessions().filter((session) => {
      if (sourceSessionIds.has(session.id)) return true;
      if (session.eventIds.some((eventId) => eventIds.has(eventId))) return true;
      return session.evidence.some((ref) => sourcePointers.has(ref.sourcePointer));
    });

    return { memory, sourceKnowledge, sourceSessions };
  } finally {
    database.close();
  }
}

export function editMemoryForDesktop(id: string, patch: MemoryEditInput): DesktopSnapshot {
  const database = openOrbitDatabase();
  try {
    editMemory(database.db, id, patch);
  } finally {
    database.close();
  }
  return readDesktopSnapshot();
}

export function getRecommendationDetailForDesktop(id: string): DesktopRecommendationDetail {
  const database = openOrbitDatabase();
  try {
    const recommendationRepository = new RecommendationRepository(database.db);
    const eventRepository = new EventRepository(database.db);
    const activityRepository = new ActivityRepository(database.db);
    const knowledgeRepository = new KnowledgeRepository(database.db);
    const memoryRepository = new MemoryRepository(database.db);
    const recommendation = recommendationRepository.getRecommendation(id);
    if (!recommendation) {
      throw new Error(`Unknown recommendation: ${id}`);
    }

    const evidenceKeys = evidenceKeySet(recommendation.evidence);
    const eventIds = recommendation.evidence.flatMap((ref) => ref.eventId ?? []);
    const sourceSessionIds = new Set(
      recommendation.evidence.flatMap((ref) => ref.activitySessionId ?? [])
    );
    const sourcePointers = new Set(recommendation.evidence.map((ref) => ref.sourcePointer));
    const sourceSessions = activityRepository.listActivitySessions().filter((session) => {
      if (sourceSessionIds.has(session.id)) return true;
      if (session.eventIds.some((eventId) => eventIds.includes(eventId))) return true;
      return session.evidence.some((ref) => sourcePointers.has(ref.sourcePointer));
    });

    return {
      recommendation,
      events: eventRepository.listEventsByIds(eventIds),
      sourceSessions,
      knowledgeArtifacts: knowledgeRepository
        .listKnowledgeArtifacts()
        .filter((artifact) => artifact.evidence.some((ref) => evidenceKeys.has(evidenceKey(ref)))),
      memories: memoryRepository
        .listMemories()
        .filter((memory) => memory.evidence.some((ref) => evidenceKeys.has(evidenceKey(ref))))
    };
  } finally {
    database.close();
  }
}

export function reviewRecommendationForDesktop(
  id: string,
  action: RecommendationReviewAction,
  options: { snoozeUntil?: string | undefined } = {}
): DesktopSnapshot {
  const database = openOrbitDatabase();
  try {
    reviewRecommendation(database.db, id, action, options);
  } finally {
    database.close();
  }
  return readDesktopSnapshot();
}

export function readDesktopSettings(): DesktopSnapshot["settings"] {
  const database = openOrbitDatabase();
  try {
    return readSettings(new SettingsRepository(database.db));
  } finally {
    database.close();
  }
}

export function readObservationStatusForDesktop(queueDepth = 0): ObservationStatus {
  const database = openOrbitDatabase();
  try {
    return readObservationStatus(new SettingsRepository(database.db), queueDepth);
  } finally {
    database.close();
  }
}

export function upsertDesktopObservationSourceForDesktop(): void {
  const database = openOrbitDatabase();
  try {
    const settings = new SettingsRepository(database.db);
    const protectedApps =
      settings.get<ObservationStatus["protectedApps"]>(SETTING_KEYS.observationProtectedApps) ??
      defaultProtectedAppRules();
    new SourceRepository(database.db).upsertFromAdapter(
      new DesktopObservationAdapter({
        inputs: [],
        id: DESKTOP_OBSERVATION_ADAPTER_ID,
        protectedApps
      })
    );
  } finally {
    database.close();
  }
}

export function writeObservationStatusForDesktop(
  status: ObservationRuntimeStatus,
  input: {
    enabled: boolean;
    paused: boolean;
    lastStartedAt?: string;
    lastStoppedAt?: string;
    lastEventAt?: string;
    lastError?: string;
  }
): void {
  const database = openOrbitDatabase();
  try {
    writeObservationStatusToSettings(new SettingsRepository(database.db), status, input);
  } finally {
    database.close();
  }
}

export function writeObservationStatusToSettings(
  settings: SettingsRepository,
  status: ObservationRuntimeStatus,
  input: {
    enabled: boolean;
    paused: boolean;
    lastStartedAt?: string;
    lastStoppedAt?: string;
    lastEventAt?: string;
    lastError?: string;
  }
): void {
  settings.set(SETTING_KEYS.observationStatus, status);
  settings.set(SETTING_KEYS.observationEnabled, input.enabled);
  settings.set(SETTING_KEYS.observationPaused, input.paused);
  if (input.lastStartedAt) settings.set(SETTING_KEYS.observationLastStartedAt, input.lastStartedAt);
  if (input.lastStoppedAt) settings.set(SETTING_KEYS.observationLastStoppedAt, input.lastStoppedAt);
  if (input.lastEventAt) settings.set(SETTING_KEYS.observationLastEventAt, input.lastEventAt);
  if (input.lastError !== undefined) {
    settings.set(SETTING_KEYS.observationLastError, input.lastError);
  }
  const existingProtectedApps = settings.get<ObservationStatus["protectedApps"]>(
    SETTING_KEYS.observationProtectedApps
  );
  if (!existingProtectedApps) {
    settings.set(SETTING_KEYS.observationProtectedApps, defaultProtectedAppRules());
  }
}

export function updateSettingForDesktop(key: DesktopSettingKey, value: unknown): DesktopSnapshot {
  const database = openOrbitDatabase();
  try {
    const settings = new SettingsRepository(database.db);
    if (key === SETTING_KEYS.menuBarEnabled || key === SETTING_KEYS.launchAtLoginEnabled) {
      settings.set(key, Boolean(value));
    } else if (key === SETTING_KEYS.language) {
      const language = String(value ?? "system");
      if (language !== "system" && language !== "en" && language !== "zh-CN") {
        throw new Error(`Unsupported language: ${language}`);
      }
      settings.set(key, language);
    } else if (key === SETTING_KEYS.configuredDatabasePath) {
      const configuredDatabasePath = String(value ?? "").trim();
      settings.set(key, configuredDatabasePath);
      writeOrbitRuntimeConfig(database.orbitHome, { configuredDatabasePath });
    } else if (key === SETTING_KEYS.aiProviderKind) {
      settings.set(key, readAIProviderKind(String(value ?? "disabled")));
    } else if (key === SETTING_KEYS.aiBaseUrl || key === SETTING_KEYS.aiModel) {
      settings.set(key, String(value ?? "").trim());
    } else if (key === SETTING_KEYS.aiApiKey) {
      settings.set(SETTING_KEYS.aiApiKeyCiphertext, encryptApiKey(String(value ?? "")));
    } else if (key === SETTING_KEYS.aiMaxTokens) {
      settings.set(key, readPositiveIntegerSetting(value, DEFAULT_OPENAI_COMPATIBLE_MAX_TOKENS));
    } else if (key === SETTING_KEYS.aiTestMaxTokens) {
      settings.set(
        key,
        readPositiveIntegerSetting(value, DEFAULT_OPENAI_COMPATIBLE_TEST_MAX_TOKENS)
      );
    } else if (key === SETTING_KEYS.aiTokenLimitParameter) {
      settings.set(key, readOpenAICompatibleTokenLimitParameter(String(value ?? "")));
    } else if (key === SETTING_KEYS.sourceSetupCompleted) {
      settings.set(key, Boolean(value));
    } else {
      throw new Error(`Unsupported setting key: ${key}`);
    }
  } finally {
    database.close();
  }
  return readDesktopSnapshot();
}

export async function setupSourceForDesktop(
  kind: SourceSetupKind,
  path?: string
): Promise<DesktopActionResult> {
  const database = openOrbitDatabase();
  try {
    const sourceRepository = new SourceRepository(database.db);
    const eventRepository = new EventRepository(database.db);
    const settingsRepository = new SettingsRepository(database.db);
    const auditRepository = new AuditRepository(database.db);
    const adapters = buildSourceSetupAdapters(kind, path);
    storeSourceAdapterConfigs(settingsRepository, kind, path, adapters);
    const results = [];
    for (const adapter of adapters) {
      sourceRepository.upsertFromAdapter(adapter);
      const cursor = sourceRepository.getCursor(adapter.id);
      const result = await ingestEventsFromAdapter(adapter, eventRepository, cursor);
      sourceRepository.setCursor(adapter.id, result.nextCursor);
      sourceRepository.recordSyncSuccess(adapter.id, { lastEventAt: result.lastEventAt });
      auditRepository.log("source.ingest", "source", adapter.id, {
        mode: "manual_setup",
        kind,
        read: result.read,
        inserted: result.inserted,
        skipped: result.skipped,
        warnings: result.warnings
      });
      results.push(result);
    }
    const pipeline = (
      await reindexLocalDataWithProvider(database, buildDesktopPipelineOptions(settingsRepository))
    ).pipeline;
    settingsRepository.set(SETTING_KEYS.sourceSetupCompleted, true);
    return {
      snapshot: readDesktopSnapshot(),
      warnings: results.flatMap((result) => result.warnings),
      message: `Configured ${kind} source; inserted ${results.reduce(
        (total, result) => total + result.inserted,
        0
      )} events; ${pipeline.activitySessions.total} activity sessions available`
    };
  } finally {
    database.close();
  }
}

export function reconfigureSourceForDesktop(
  sourceId: string,
  kind: SourceSetupKind,
  path?: string
): DesktopActionResult {
  const database = openOrbitDatabase();
  try {
    const sourceRepository = new SourceRepository(database.db);
    const settingsRepository = new SettingsRepository(database.db);
    const auditRepository = new AuditRepository(database.db);
    const existing = sourceRepository.getSource(sourceId);
    if (!existing) {
      throw new Error(`Unknown source: ${sourceId}`);
    }
    const adapter = buildSingleSourceAdapter(kind, path, sourceId, existing.kind);
    sourceRepository.upsertFromAdapter(adapter);
    storeSingleSourceAdapterConfig(settingsRepository, kind, path, adapter);
    auditRepository.log("source.reconfigure", "source", sourceId, {
      previous: {
        kind: existing.kind,
        displayName: existing.displayName
      },
      next: {
        kind,
        path: path ? resolveInputPath(path) : undefined
      }
    });
    return {
      snapshot: readDesktopSnapshot(),
      message: `Reconfigured ${adapter.displayName}`
    };
  } finally {
    database.close();
  }
}

export function deleteSourceForDesktop(sourceId: string): DesktopActionResult {
  const database = openOrbitDatabase();
  try {
    const sources = new SourceRepository(database.db);
    const settings = new SettingsRepository(database.db);
    const audit = new AuditRepository(database.db);
    const source = sources.getSource(sourceId);
    if (!source) {
      throw new Error(`Unknown source: ${sourceId}`);
    }
    const result = sources.deleteSource(sourceId);
    removeSourceAdapterConfig(settings, sourceId);
    audit.log("source.delete", "source", sourceId, {
      displayName: source.displayName,
      deletedSources: result.deletedSources,
      deletedCursors: result.deletedCursors
    });
    return {
      snapshot: readDesktopSnapshot(),
      message: `Deleted source ${source.displayName}`
    };
  } finally {
    database.close();
  }
}

export function resetSourceCursorForDesktop(sourceId: string): DesktopActionResult {
  const database = openOrbitDatabase();
  try {
    const sources = new SourceRepository(database.db);
    const source = sources.getSource(sourceId);
    if (!source) {
      throw new Error(`Unknown source: ${sourceId}`);
    }
    const previousCursor = sources.getCursor(sourceId);
    sources.resetCursor(sourceId);
    new AuditRepository(database.db).log("source.reset_cursor", "source", sourceId, {
      hadCursor: previousCursor !== undefined
    });
    return {
      snapshot: readDesktopSnapshot(),
      message: `Reset cursor for ${source.displayName}`
    };
  } finally {
    database.close();
  }
}

export function cleanupLegacyEventPrivacyForDesktop(): DesktopActionResult {
  const database = openOrbitDatabase();
  try {
    const result = cleanupLegacyEventPrivacy(database);
    return {
      snapshot: readDesktopSnapshot(),
      message: `Cleaned ${result.cleanedEvents} legacy events; scanned ${result.scannedEvents}`
    };
  } finally {
    database.close();
  }
}

export function cleanupPerceptionSidecarsForDesktop(): DesktopActionResult {
  const database = openOrbitDatabase();
  try {
    const result = cleanupPerceptionSidecars(database);
    return {
      snapshot: readDesktopSnapshot(),
      message: `Cleaned ${result.cleanedEvents} perception events; removed ${result.removedRawRefs} raw refs`,
      warnings: result.warnings
    };
  } finally {
    database.close();
  }
}

export async function captureScreenOcrForDesktop(): Promise<DesktopActionResult> {
  const database = openOrbitDatabase();
  try {
    const sourceRepository = new SourceRepository(database.db);
    const eventRepository = new EventRepository(database.db);
    const auditRepository = new AuditRepository(database.db);
    const settingsRepository = new SettingsRepository(database.db);
    const perception = readPerceptionStatus(database.db);
    const helper = new MacScreenOcrCaptureHelper();
    const capture = await helper.captureOnce();
    const warnings = [...capture.warnings];

    if (!capture.frame) {
      auditRepository.log(
        "perception.capture_screen_ocr",
        "source",
        SCREEN_OBSERVATION_ADAPTER_ID,
        {
          mode: "desktop_manual_live_screen_ocr",
          inserted: 0,
          permission: capture.permission.status,
          warnings
        }
      );
      return {
        snapshot: readDesktopSnapshot(),
        warnings,
        message: `Screen/OCR capture did not record a frame; permission is ${capture.permission.status}`
      };
    }

    const screenPolicy = perception.sources.find(
      (source) => source.sourceKind === "screen"
    )?.policy;
    const ocrPolicy = perception.sources.find((source) => source.sourceKind === "ocr")?.policy;
    const adapters: SourceAdapter[] = [
      new ScreenObservationAdapter({
        id: SCREEN_OBSERVATION_ADAPTER_ID,
        frames: [capture.frame],
        scope: capture.frame.scope,
        permission: capture.permission,
        protectedApps: perception.protectedApps,
        allowRawFrameStorage: false,
        canUseForAI: screenPolicy?.canUseForAI === true,
        canExportToAgent: screenPolicy?.canExportToAgent === true
      })
    ];

    if (capture.ocr?.text.trim()) {
      adapters.push(
        new OcrObservationAdapter({
          id: OCR_OBSERVATION_ADAPTER_ID,
          frames: [capture.frame],
          scope: capture.frame.scope,
          engine: new CapturedTextOcrEngine(
            new Map<string, ScreenOcrTextResult>([[capture.frame.frameHash, capture.ocr]])
          ),
          permission: capture.permission,
          protectedApps: perception.protectedApps,
          canUseForAI: ocrPolicy?.canUseForAI === true,
          canExportToAgent: ocrPolicy?.canExportToAgent === true
        })
      );
    } else {
      warnings.push("Screen capture succeeded, but OCR produced no text.");
    }

    const results = [];
    for (const adapter of adapters) {
      sourceRepository.upsertFromAdapter(adapter);
      const cursor = sourceRepository.getCursor(adapter.id);
      const result = await ingestEventsFromAdapter(adapter, eventRepository, cursor);
      sourceRepository.setCursor(adapter.id, result.nextCursor);
      sourceRepository.recordSyncSuccess(adapter.id, { lastEventAt: result.lastEventAt });
      auditRepository.log("perception.capture_screen_ocr", "source", adapter.id, {
        mode: "desktop_manual_live_screen_ocr",
        kind: adapter.kind,
        read: result.read,
        inserted: result.inserted,
        skipped: result.skipped,
        rawStored: false,
        warnings: result.warnings
      });
      results.push(result);
    }

    const boundaryEvent = normalizeObservationInput(
      {
        type: "observation_state",
        tier: "tier3",
        sourceKind: "screen",
        occurredAt: new Date(new Date(capture.frame.capturedAt).getTime() + 1).toISOString(),
        runtimeSessionId: capture.frame.runtimeSessionId,
        sequence: capture.frame.sequence + 10_000
      },
      { adapterId: SCREEN_OBSERVATION_ADAPTER_ID, protectedApps: perception.protectedApps }
    );
    const insertedBoundary = eventRepository.upsertEvent(boundaryEvent);
    auditRepository.log(
      "perception.capture_screen_ocr_boundary",
      "source",
      SCREEN_OBSERVATION_ADAPTER_ID,
      {
        mode: "desktop_manual_live_screen_ocr",
        inserted: insertedBoundary
      }
    );

    settingsRepository.set(SETTING_KEYS.sourceSetupCompleted, true);
    const pipeline = (
      await reindexLocalDataWithProvider(database, buildDesktopPipelineOptions(settingsRepository))
    ).pipeline;
    const inserted = results.reduce((total, result) => total + result.inserted, 0);
    return {
      snapshot: readDesktopSnapshot(),
      warnings: results.flatMap((result) => result.warnings).concat(warnings),
      message: `Captured current screen/OCR into ${inserted} event(s); ${pipeline.activitySessions.total} activity sessions available`
    };
  } finally {
    database.close();
  }
}

export function generateHandoffForDesktop(input: DesktopHandoffRequest): DesktopHandoffResult {
  const database = openOrbitDatabase();
  try {
    const settings = new SettingsRepository(database.db);
    const handoff =
      input.kind === "project"
        ? buildProjectHandoffPack(database, input.project)
        : buildTodayHandoffPack(database, input.date ? { date: input.date } : {});
    return {
      snapshot: readDesktopSnapshot(),
      message: `Generated ${handoff.kind} handoff`,
      handoff,
      markdown: formatHandoffMarkdown(handoff, {
        language: readEffectiveDesktopLanguage(settings)
      })
    };
  } finally {
    database.close();
  }
}

export async function reindexForDesktop(): Promise<DesktopActionResult> {
  const database = openOrbitDatabase();
  try {
    const result = await reindexLocalDataWithProvider(
      database,
      buildDesktopPipelineOptions(new SettingsRepository(database.db))
    );
    return {
      snapshot: readDesktopSnapshot(),
      message: `Re-indexed ${result.pipeline.events} events into ${result.pipeline.activitySessions.total} activity sessions`
    };
  } finally {
    database.close();
  }
}

export function clearLocalDataForDesktop(): DesktopActionResult {
  const database = openOrbitDatabase();
  try {
    const result = clearLocalData(database);
    const deleted = Object.values(result.deletedTables).reduce((total, count) => total + count, 0);
    return {
      snapshot: readDesktopSnapshot(),
      message: `Cleared ${deleted} local records`
    };
  } finally {
    database.close();
  }
}

export function exportContextForDesktop(): DesktopActionResult {
  const database = openOrbitDatabase();
  try {
    const result = exportTodayContext(database);
    return {
      snapshot: readDesktopSnapshot(),
      message: `Exported context to ${result.path}`,
      exportPath: result.path
    };
  } finally {
    database.close();
  }
}

export function setCollectionPausedForDesktop(paused: boolean): DesktopSnapshot {
  const database = openOrbitDatabase();
  try {
    const settings = new SettingsRepository(database.db);
    settings.set(SETTING_KEYS.runtimeCollectionPaused, paused);
    writeRuntimeStatus(settings, paused ? "paused" : "idle");
    new AuditRepository(database.db).log(
      paused ? "runtime.pause" : "runtime.resume",
      "runtime",
      undefined,
      { paused }
    );
  } finally {
    database.close();
  }
  return readDesktopSnapshot();
}

export function updateSourceRuntimeForDesktop(
  sourceId: string,
  action: DesktopSourceRuntimeAction
): DesktopSnapshot {
  const database = openOrbitDatabase();
  try {
    const sources = new SourceRepository(database.db);
    const source = sources.getSource(sourceId);
    if (!source) {
      throw new Error(`Unknown source: ${sourceId}`);
    }
    if (action === "pause") {
      sources.setPaused(sourceId, true);
    } else if (action === "resume") {
      sources.setPaused(sourceId, false);
    } else if (action === "disable") {
      sources.setEnabled(sourceId, false);
    } else if (action === "enable") {
      sources.setEnabled(sourceId, true);
      sources.setPaused(sourceId, false);
    } else {
      throw new Error(`Unsupported source runtime action: ${action}`);
    }
    new AuditRepository(database.db).log(`source.${action}`, "source", sourceId, {
      previous: { enabled: source.enabled, paused: source.paused }
    });
  } finally {
    database.close();
  }
  return readDesktopSnapshot();
}

export function updatePerceptionSourceRuntimeForDesktop(
  sourceKind: PerceptionSourceKind,
  action: PerceptionSourceRuntimeAction
): DesktopSnapshot {
  const database = openOrbitDatabase();
  try {
    updatePerceptionSourceRuntime(database.db, sourceKind, action);
    if (action === "disable" || action === "delete") {
      cleanupPerceptionSidecars(database, { sourceKind });
    }
  } finally {
    database.close();
  }
  return readDesktopSnapshot();
}

export function updatePerceptionSourcePolicyForDesktop(
  sourceKind: PerceptionSourceKind,
  patch: PerceptionSourcePolicyPatch
): DesktopSnapshot {
  const database = openOrbitDatabase();
  try {
    updatePerceptionSourcePolicy(database.db, sourceKind, patch);
    if (patch.canStoreRaw === false || patch.rawRetentionTtlMinutes === null) {
      cleanupPerceptionSidecars(database, { sourceKind });
    }
  } finally {
    database.close();
  }
  return readDesktopSnapshot();
}

export function updatePerceptionProviderRouteForDesktop(
  task: PerceptionProviderTask,
  provider: PerceptionProviderKind
): DesktopSnapshot {
  const database = openOrbitDatabase();
  try {
    updatePerceptionProviderRoute(database.db, task, provider);
  } finally {
    database.close();
  }
  return readDesktopSnapshot();
}

export interface BackgroundIngestionResult {
  status: DesktopRuntimeStatus;
  sourceCount: number;
  attempted: number;
  read: number;
  inserted: number;
  skipped: number;
  errors: string[];
}

export async function runBackgroundIngestionForDesktop(): Promise<BackgroundIngestionResult> {
  const database = openOrbitDatabase();
  try {
    const settings = new SettingsRepository(database.db);
    const sourceRepository = new SourceRepository(database.db);
    const eventRepository = new EventRepository(database.db);
    const auditRepository = new AuditRepository(database.db);
    if (settings.get<boolean>(SETTING_KEYS.runtimeCollectionPaused) ?? false) {
      writeRuntimeStatus(settings, "paused");
      return {
        status: "paused",
        sourceCount: sourceRepository.countSources(),
        attempted: 0,
        read: 0,
        inserted: 0,
        skipped: 0,
        errors: []
      };
    }

    const sources = sourceRepository.listSources();
    const startedAt = new Date().toISOString();
    writeRuntimeStatus(settings, "collecting", { lastRunAt: startedAt });
    let attempted = 0;
    let read = 0;
    let inserted = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const source of sources) {
      if (source.kind === "desktop") continue;
      if (!isGenericBackgroundSource(source.kind)) continue;
      if (!source.enabled || source.paused) continue;
      attempted += 1;
      try {
        const adapter = buildBackgroundAdapter(source.id, source.kind, settings);
        const cursor = sourceRepository.getCursor(adapter.id);
        const result = await ingestEventsFromAdapter(adapter, eventRepository, cursor);
        sourceRepository.setCursor(adapter.id, result.nextCursor);
        sourceRepository.recordSyncSuccess(adapter.id, { lastEventAt: result.lastEventAt });
        read += result.read;
        inserted += result.inserted;
        skipped += result.skipped;
        auditRepository.log("source.ingest", "source", adapter.id, {
          mode: "background",
          read: result.read,
          inserted: result.inserted,
          skipped: result.skipped,
          warnings: result.warnings,
          nextCursor: result.nextCursor
        });
      } catch (error) {
        const message = formatUnknownError(error);
        errors.push(`${source.displayName}: ${message}`);
        sourceRepository.recordSyncError(source.id, message);
        auditRepository.log("source.ingest_failed", "source", source.id, {
          mode: "background",
          message
        });
      }
    }

    if (inserted > 0) {
      const pipeline = (await reindexLocalDataWithProvider(database, BACKGROUND_PIPELINE_OPTIONS))
        .pipeline;
      auditRepository.log("background.pipeline.run", "database", undefined, {
        aiProvider: "disabled",
        events: pipeline.events,
        inserted
      });
    }

    const completedAt = new Date().toISOString();
    const status: DesktopRuntimeStatus = errors.length > 0 ? "error" : "idle";
    writeRuntimeStatus(settings, status, {
      lastCompletedAt: completedAt,
      lastError: errors.length > 0 ? errors[0] : ""
    });
    auditRepository.log("background.ingest_cycle", "runtime", undefined, {
      startedAt,
      completedAt,
      sourceCount: sources.length,
      attempted,
      read,
      inserted,
      skipped,
      errors
    });
    return { status, sourceCount: sources.length, attempted, read, inserted, skipped, errors };
  } finally {
    database.close();
  }
}

export async function testAIProviderForDesktop(
  input: DesktopAIProviderTestConfig
): Promise<AIProviderConnectionTestResult> {
  const startedAt = Date.now();
  const database = openOrbitDatabase();
  try {
    const settings = new SettingsRepository(database.db);
    const config = buildDesktopAIProviderConfig(settings, input);
    try {
      return await testAIProviderConnection(config);
    } catch (error) {
      const endpoint = config.baseUrl ? safeNormalizeEndpoint(config.baseUrl) : undefined;
      return {
        ok: false,
        provider: config.kind,
        message: formatUnknownError(error),
        latencyMs: Date.now() - startedAt,
        ...(endpoint ? { endpoint } : {}),
        ...(config.model ? { model: config.model } : {})
      };
    }
  } finally {
    database.close();
  }
}

function filterKnowledgeArtifacts(
  artifacts: KnowledgeArtifact[],
  filters: DesktopKnowledgeSearchFilters
): KnowledgeArtifact[] {
  return artifacts.filter((artifact) => {
    if (filters.status && artifact.status !== filters.status) return false;
    if (filters.type && artifact.type !== filters.type) return false;
    if (filters.project && !artifact.metadata.projects.includes(filters.project)) return false;
    if (
      filters.sourceKind &&
      !artifact.evidence.some((ref) => ref.sourceKind === filters.sourceKind)
    ) {
      return false;
    }
    const date = artifact.metadata.timeWindow?.startAt ?? artifact.createdAt;
    if (filters.dateFrom && date < `${filters.dateFrom}T00:00:00.000Z`) return false;
    if (filters.dateTo && date > `${filters.dateTo}T23:59:59.999Z`) return false;
    return true;
  });
}

function filterMemories(memories: Memory[], filters: DesktopMemorySearchFilters): Memory[] {
  return memories.filter((memory) => {
    if (filters.status && memory.status !== filters.status) return false;
    if (filters.kind && memory.kind !== filters.kind) return false;
    if (filters.project && memory.scope.project !== filters.project) return false;
    if (
      filters.sourceKind &&
      !memory.scope.sourceKinds?.some((kind) => kind === filters.sourceKind) &&
      !memory.evidence.some((ref) => ref.sourceKind === filters.sourceKind)
    ) {
      return false;
    }
    if (filters.tag && !memory.tags.includes(filters.tag)) return false;
    return true;
  });
}

function toFtsQuery(query: string): string {
  return query
    .split(/\s+/)
    .map((term) => `"${term.replaceAll('"', '""')}"`)
    .join(" ");
}

function evidenceKeySet(evidence: EvidenceRef[]): Set<string> {
  return new Set(evidence.map(evidenceKey));
}

function evidenceKey(ref: EvidenceRef): string {
  return `${ref.eventId ?? ""}:${ref.activitySessionId ?? ""}:${ref.sourcePointer}`;
}

function readSettings(settings: SettingsRepository): DesktopSnapshot["settings"] {
  const configuredDatabasePath = settings.get<string>(SETTING_KEYS.configuredDatabasePath);
  const aiProvider = readAIProviderKind(settings.get<string>(SETTING_KEYS.aiProviderKind));
  const aiBaseUrl = settings.get<string>(SETTING_KEYS.aiBaseUrl);
  const aiModel = settings.get<string>(SETTING_KEYS.aiModel);
  const aiApiKeyCiphertext = settings.get<string>(SETTING_KEYS.aiApiKeyCiphertext);
  const aiMaxTokens = readPositiveIntegerSetting(
    settings.get<number>(SETTING_KEYS.aiMaxTokens),
    DEFAULT_OPENAI_COMPATIBLE_MAX_TOKENS
  );
  const aiTestMaxTokens = readPositiveIntegerSetting(
    settings.get<number>(SETTING_KEYS.aiTestMaxTokens),
    DEFAULT_OPENAI_COMPATIBLE_TEST_MAX_TOKENS
  );
  const snapshotSettings: DesktopSnapshot["settings"] = {
    localOnly: true,
    aiProvider,
    aiMaxTokens,
    aiTestMaxTokens,
    aiTokenLimitParameter: readOpenAICompatibleTokenLimitParameter(
      settings.get<string>(SETTING_KEYS.aiTokenLimitParameter)
    ),
    aiApiKeyConfigured: Boolean(aiApiKeyCiphertext),
    externalActionsEnabled: false,
    visualContextEnabled: readPerceptionStatusFromSettings(settings).enabled,
    menuBarEnabled: settings.get<boolean>(SETTING_KEYS.menuBarEnabled) ?? true,
    launchAtLoginEnabled: settings.get<boolean>(SETTING_KEYS.launchAtLoginEnabled) ?? false,
    language: readLanguageSetting(settings.get<string>(SETTING_KEYS.language)),
    sourceSetupCompleted: settings.get<boolean>(SETTING_KEYS.sourceSetupCompleted) ?? false
  };
  if (configuredDatabasePath) {
    snapshotSettings.configuredDatabasePath = configuredDatabasePath;
  }
  if (aiBaseUrl) {
    snapshotSettings.aiBaseUrl = aiBaseUrl;
  }
  if (aiModel) {
    snapshotSettings.aiModel = aiModel;
  }
  return snapshotSettings;
}

function readRuntime(settings: SettingsRepository): DesktopSnapshot["runtime"] {
  const paused = settings.get<boolean>(SETTING_KEYS.runtimeCollectionPaused) ?? false;
  const runtime: DesktopSnapshot["runtime"] = {
    status: paused ? "paused" : readRuntimeStatus(settings.get<string>(SETTING_KEYS.runtimeStatus)),
    collectionPaused: paused
  };
  const lastRunAt = settings.get<string>(SETTING_KEYS.runtimeLastRunAt);
  const lastCompletedAt = settings.get<string>(SETTING_KEYS.runtimeLastCompletedAt);
  const lastError = settings.get<string>(SETTING_KEYS.runtimeLastError);
  if (lastRunAt) runtime.lastRunAt = lastRunAt;
  if (lastCompletedAt) runtime.lastCompletedAt = lastCompletedAt;
  if (lastError) runtime.lastError = lastError;
  return runtime;
}

function readObservationStatus(settings: SettingsRepository, queueDepth = 0): ObservationStatus {
  const runtimeStatus =
    settings.get<ObservationRuntimeStatus>(SETTING_KEYS.observationStatus) ?? "not_configured";
  const enabled = settings.get<boolean>(SETTING_KEYS.observationEnabled) ?? false;
  const paused = settings.get<boolean>(SETTING_KEYS.observationPaused) ?? false;
  const protectedApps =
    settings.get<ObservationStatus["protectedApps"]>(SETTING_KEYS.observationProtectedApps) ??
    defaultProtectedAppRules();
  const allowedFolders =
    settings.get<ObservationStatus["allowedFolders"]>(SETTING_KEYS.observationAllowedFolders) ?? [];
  const tier2 = readTier2Status(settings, allowedFolders);
  const lastStartedAt = settings.get<string>(SETTING_KEYS.observationLastStartedAt);
  const lastStoppedAt = settings.get<string>(SETTING_KEYS.observationLastStoppedAt);
  const lastEventAt = settings.get<string>(SETTING_KEYS.observationLastEventAt);
  const lastError = settings.get<string>(SETTING_KEYS.observationLastError);
  const overrides: Partial<ObservationStatus> = {
    status: enabled ? runtimeStatus : tier2.enabled ? tier2.status : runtimeStatus,
    enabled,
    paused,
    protectedApps,
    allowedFolders,
    permissions: tier2.permissions,
    queueDepth
  };
  if (lastStartedAt) overrides.lastStartedAt = lastStartedAt;
  if (lastStoppedAt) overrides.lastStoppedAt = lastStoppedAt;
  if (lastEventAt) overrides.lastEventAt = lastEventAt;
  if (lastError) overrides.lastError = lastError;
  if (enabled || tier2.enabled) {
    overrides.tiers = {
      tier1: {
        enabled,
        status: enabled ? (paused ? "paused" : runtimeStatus) : "not_configured",
        sourceKinds: ["desktop"],
        ...(lastEventAt ? { lastEventAt } : {}),
        ...(lastError ? { lastError } : {})
      },
      tier2: {
        enabled: tier2.enabled,
        status: tier2.status,
        sourceKinds: ["accessibility", "browser", "terminal", "clipboard", "filesystem"]
      },
      tier3: {
        enabled: false,
        status: "disabled",
        sourceKinds: ["screen", "ocr", "audio", "transcript"]
      }
    };
  }
  return createDefaultObservationStatus(overrides);
}

function readTier2Status(
  settings: SettingsRepository,
  allowedFolders: AllowedFolderRule[]
): {
  enabled: boolean;
  status: ObservationRuntimeStatus;
  permissions: ObservationPermissionStatus[];
} {
  const accessibilityEnabled = settings.get<boolean>("observation.accessibility.enabled") ?? false;
  const browserEnabled = settings.get<boolean>("observation.browser.enabled") ?? false;
  const filesystemEnabled = settings.get<boolean>("observation.filesystem.enabled") ?? false;
  const clipboardEnabled = settings.get<boolean>("observation.clipboard.enabled") ?? false;
  const terminalEnabled = settings.get<boolean>("observation.terminal.enabled") ?? false;
  const enabled =
    accessibilityEnabled ||
    browserEnabled ||
    filesystemEnabled ||
    clipboardEnabled ||
    terminalEnabled;
  const accessibilityStatus =
    accessibilityEnabled || browserEnabled
      ? (settings.get<ObservationPermissionStatus["status"]>(
          "observation.permission.accessibility"
        ) ?? detectAccessibilityPermissionStatus().status)
      : "not_required";
  const filesystemStatus: ObservationPermissionStatus["status"] =
    filesystemEnabled && allowedFolders.some((folder) => folder.enabled)
      ? "granted"
      : readPermissionStatus(settings, "observation.permission.filesystem", filesystemEnabled);
  const automationStatus = readPermissionStatus(
    settings,
    "observation.permission.automation",
    terminalEnabled
  );
  const permissions: ObservationPermissionStatus[] = [
    {
      kind: "accessibility",
      requiredFor: ["accessibility", "browser"],
      status: accessibilityStatus,
      canRequestFromApp: false
    },
    {
      kind: "filesystem",
      requiredFor: ["filesystem"],
      status: filesystemStatus,
      canRequestFromApp: true
    },
    {
      kind: "screen",
      requiredFor: ["screen", "ocr"],
      status: "not_required",
      canRequestFromApp: true
    },
    {
      kind: "microphone",
      requiredFor: ["audio", "transcript"],
      status: "not_required",
      canRequestFromApp: true
    },
    {
      kind: "automation",
      requiredFor: ["terminal"],
      status: automationStatus,
      canRequestFromApp: false
    }
  ];
  const needsPermission = permissions.some(
    (permission) =>
      permission.status === "not_determined" ||
      permission.status === "denied" ||
      permission.status === "restricted" ||
      permission.status === "unknown"
  );
  return {
    enabled,
    status: !enabled ? "disabled" : needsPermission ? "needs_permission" : "ready",
    permissions
  };
}

function readPermissionStatus(
  settings: SettingsRepository,
  key: string,
  required: boolean
): ObservationPermissionStatus["status"] {
  if (!required) return "not_required";
  const value = settings.get<ObservationPermissionStatus["status"]>(key);
  return value ?? "not_determined";
}

function readRuntimeStatus(value: string | undefined): DesktopRuntimeStatus {
  if (value === "collecting" || value === "paused" || value === "error") return value;
  return "idle";
}

function writeRuntimeStatus(
  settings: SettingsRepository,
  status: DesktopRuntimeStatus,
  options: {
    lastRunAt?: string | undefined;
    lastCompletedAt?: string | undefined;
    lastError?: string | undefined;
  } = {}
): void {
  settings.set(SETTING_KEYS.runtimeStatus, status);
  if (options.lastRunAt) {
    settings.set(SETTING_KEYS.runtimeLastRunAt, options.lastRunAt);
  }
  if (options.lastCompletedAt) {
    settings.set(SETTING_KEYS.runtimeLastCompletedAt, options.lastCompletedAt);
  }
  if (options.lastError !== undefined) {
    settings.set(SETTING_KEYS.runtimeLastError, options.lastError);
  }
}

function readLanguageSetting(value: string | undefined): "system" | "en" | "zh-CN" {
  return value === "en" || value === "zh-CN" ? value : "system";
}

function readEffectiveDesktopLanguage(settings: SettingsRepository): "en" | "zh-CN" {
  const language = readLanguageSetting(settings.get<string>(SETTING_KEYS.language));
  return language === "zh-CN" ? "zh-CN" : "en";
}

function buildDesktopAIProvider(settings: SettingsRepository): AIProvider | undefined {
  const kind = readAIProviderKind(settings.get<string>(SETTING_KEYS.aiProviderKind));
  if (kind === "disabled") return undefined;
  const config = buildDesktopAIProviderConfig(settings, { providerKind: kind });
  if (kind === "openai-compatible" && (!config.baseUrl || !config.model)) return undefined;
  return buildAIProvider(config);
}

function buildDesktopPipelineOptions(settings: SettingsRepository): { aiProvider?: AIProvider } {
  const aiProvider = buildDesktopAIProvider(settings);
  return aiProvider ? { aiProvider } : {};
}

function readAIProviderKind(value: string | undefined): "disabled" | "openai-compatible" {
  if (value === "openai-compatible") return value;
  return "disabled";
}

function buildDesktopAIProviderConfig(
  settings: SettingsRepository,
  input: DesktopAIProviderTestConfig = {}
): AIProviderConfig {
  const kind = readAIProviderKind(
    input.providerKind ?? settings.get<string>(SETTING_KEYS.aiProviderKind)
  );
  const config: AIProviderConfig = { kind };
  if (kind !== "openai-compatible") return config;

  const baseUrl = readOptionalString(input.baseUrl) ?? settings.get<string>(SETTING_KEYS.aiBaseUrl);
  const model = readOptionalString(input.model) ?? settings.get<string>(SETTING_KEYS.aiModel);
  const maxTokens =
    readOptionalPositiveInteger(input.maxTokens) ??
    readPositiveIntegerSetting(
      settings.get<number>(SETTING_KEYS.aiMaxTokens),
      DEFAULT_OPENAI_COMPATIBLE_MAX_TOKENS
    );
  const testMaxTokens =
    readOptionalPositiveInteger(input.testMaxTokens) ??
    readPositiveIntegerSetting(
      settings.get<number>(SETTING_KEYS.aiTestMaxTokens),
      DEFAULT_OPENAI_COMPATIBLE_TEST_MAX_TOKENS
    );
  const tokenLimitParameter = readDesktopTokenLimitParameter(
    input.tokenLimitParameter ?? settings.get<string>(SETTING_KEYS.aiTokenLimitParameter)
  );
  const apiKey =
    readOptionalString(input.apiKey) ??
    decryptApiKey(settings.get<string>(SETTING_KEYS.aiApiKeyCiphertext));
  if (baseUrl) config.baseUrl = baseUrl;
  if (model) config.model = model;
  config.maxTokens = maxTokens;
  config.testMaxTokens = testMaxTokens;
  config.tokenLimitParameter = tokenLimitParameter;
  if (apiKey) config.apiKey = apiKey;
  return config;
}

function isGenericBackgroundSource(sourceKind: SourceKind): boolean {
  return sourceKind === "codex" || sourceKind === "local_agent" || sourceKind === "seatalk";
}

function buildBackgroundAdapter(
  sourceId: string,
  sourceKind: SourceKind,
  settings: SettingsRepository
): SourceAdapter {
  const config = readSourceAdapterConfigs(settings)[sourceId];
  if (config?.setupKind === "fixtures" || sourceId.startsWith("fixture_")) {
    const fixturesRoot =
      config?.fixturesRoot ?? resolveInputPath(process.env.ORBIT_FIXTURES_ROOT ?? "fixtures");
    return new FixtureAdapter({
      kind: sourceKind,
      directory: join(fixturesRoot, sourceKind),
      id: sourceId,
      displayName: sourceKind === "seatalk" ? "Fixture SeaTalk" : "Fixture Codex",
      defaultSensitivity: sourceKind === "seatalk" ? "confidential" : "internal"
    });
  }

  const path = config?.path;
  if (!path) {
    throw new Error("Missing adapter path; reconfigure this source before background collection.");
  }
  if (sourceKind === "codex") {
    return new CodexAdapter({ path, id: sourceId });
  }
  if (sourceKind === "local_agent") {
    return new LocalAgentAdapter({ path, id: sourceId, defaultApp: "Local Agent" });
  }
  if (sourceKind === "seatalk") {
    return new SeaTalkAdapter({ approvedImportDirectory: path, id: sourceId });
  }
  throw new Error(`Unsupported background source kind: ${sourceKind}`);
}

function storeSourceAdapterConfigs(
  settings: SettingsRepository,
  setupKind: SourceSetupKind,
  path: string | undefined,
  adapters: SourceAdapter[]
): void {
  const configs = readSourceAdapterConfigs(settings);
  const resolvedPath = path ? resolveInputPath(path) : undefined;
  const fixturesRoot =
    setupKind === "fixtures"
      ? resolveInputPath(process.env.ORBIT_FIXTURES_ROOT ?? "fixtures")
      : undefined;
  for (const adapter of adapters) {
    const config: StoredSourceAdapterConfig = { setupKind };
    if (resolvedPath) config.path = resolvedPath;
    if (fixturesRoot) config.fixturesRoot = fixturesRoot;
    configs[adapter.id] = config;
  }
  settings.set(SETTING_KEYS.sourceAdapterConfigs, configs);
}

function storeSingleSourceAdapterConfig(
  settings: SettingsRepository,
  setupKind: SourceSetupKind,
  path: string | undefined,
  adapter: SourceAdapter
): void {
  storeSourceAdapterConfigs(settings, setupKind, path, [adapter]);
}

function removeSourceAdapterConfig(settings: SettingsRepository, sourceId: string): void {
  const configs = readSourceAdapterConfigs(settings);
  delete configs[sourceId];
  settings.set(SETTING_KEYS.sourceAdapterConfigs, configs);
}

function readSourceAdapterConfigs(settings: SettingsRepository): StoredSourceAdapterConfigs {
  return settings.get<StoredSourceAdapterConfigs>(SETTING_KEYS.sourceAdapterConfigs) ?? {};
}

function readSourceCursorPresence(sources: SourceRepository): Record<string, boolean> {
  return Object.fromEntries(
    sources.listSources().map((source) => [source.id, sources.getCursor(source.id) !== undefined])
  );
}

function readDesktopTokenLimitParameter(value: unknown): OpenAICompatibleTokenLimitParameter {
  return readOpenAICompatibleTokenLimitParameter(typeof value === "string" ? value : undefined);
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readOptionalPositiveInteger(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  if (!text) return undefined;
  const parsed = Number(text);
  if (!Number.isInteger(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function readPositiveIntegerSetting(value: unknown, fallback: number): number {
  return readOptionalPositiveInteger(value) ?? fallback;
}

function safeNormalizeEndpoint(baseUrl: string): string | undefined {
  try {
    return normalizeChatCompletionsUrl(baseUrl);
  } catch {
    return undefined;
  }
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function encryptApiKey(value: string): string {
  const apiKey = value.trim();
  if (!apiKey) return "";
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("OS encryption is unavailable; API key was not saved.");
  }
  return safeStorage.encryptString(apiKey).toString("base64");
}

function decryptApiKey(ciphertext: string | undefined): string | undefined {
  if (!ciphertext) return undefined;
  if (!safeStorage.isEncryptionAvailable()) return undefined;
  try {
    return safeStorage.decryptString(Buffer.from(ciphertext, "base64"));
  } catch {
    return undefined;
  }
}

function buildSourceSetupAdapters(kind: SourceSetupKind, path?: string) {
  const resolvedPath = path ? resolveInputPath(path) : undefined;
  switch (kind) {
    case "fixtures": {
      const fixturesRoot = resolveInputPath(process.env.ORBIT_FIXTURES_ROOT ?? "fixtures");
      return [
        new FixtureAdapter({
          kind: "codex",
          directory: join(fixturesRoot, "codex"),
          id: "fixture_codex",
          displayName: "Fixture Codex"
        }),
        new FixtureAdapter({
          kind: "seatalk",
          directory: join(fixturesRoot, "seatalk"),
          id: "fixture_seatalk",
          displayName: "Fixture SeaTalk",
          defaultSensitivity: "confidential"
        })
      ];
    }
    case "codex":
      if (!resolvedPath) throw new Error("Codex source setup requires a path");
      return [new CodexAdapter({ path: resolvedPath })];
    case "local_agent":
      if (!resolvedPath) throw new Error("Local agent source setup requires a path");
      return [new LocalAgentAdapter({ path: resolvedPath, defaultApp: "Local Agent" })];
    case "seatalk":
      if (!resolvedPath) throw new Error("SeaTalk approved import setup requires a path");
      return [new SeaTalkAdapter({ approvedImportDirectory: resolvedPath })];
  }
}

function buildSingleSourceAdapter(
  kind: SourceSetupKind,
  path: string | undefined,
  id: string,
  existingKind?: SourceKind
) {
  if (kind === "fixtures") {
    const fixturesRoot = resolveInputPath(process.env.ORBIT_FIXTURES_ROOT ?? "fixtures");
    const sourceKind: SourceKind = existingKind === "seatalk" ? "seatalk" : "codex";
    return new FixtureAdapter({
      kind: sourceKind,
      directory: join(fixturesRoot, sourceKind),
      id,
      displayName: sourceKind === "seatalk" ? "Fixture SeaTalk" : "Fixture Codex",
      defaultSensitivity: sourceKind === "seatalk" ? "confidential" : "internal"
    });
  }
  const resolvedPath = path ? resolveInputPath(path) : undefined;
  if (!resolvedPath) throw new Error(`${kind} source reconfiguration requires a path`);
  if (kind === "codex") {
    return new CodexAdapter({ path: resolvedPath, id });
  }
  if (kind === "local_agent") {
    return new LocalAgentAdapter({ path: resolvedPath, id, defaultApp: "Local Agent" });
  }
  return new SeaTalkAdapter({ approvedImportDirectory: resolvedPath, id });
}

function resolveInputPath(input: string): string {
  return isAbsolute(input) ? input : resolve(process.env.INIT_CWD ?? process.cwd(), input);
}
