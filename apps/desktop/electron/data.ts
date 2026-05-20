import { buildTodayContext, getLocalDateKey, ingestEventsFromAdapter } from "@orbit/core";
import { CodexAdapter, FixtureAdapter, LocalAgentAdapter, SeaTalkAdapter } from "@orbit/adapters";
import {
  buildAIProvider,
  normalizeChatCompletionsUrl,
  testAIProviderConnection,
  type AIProvider,
  type AIProviderConfig,
  type AIProviderConnectionTestResult,
  type AIProviderKind
} from "@orbit/ai";
import {
  ActivityRepository,
  clearLocalData,
  EventRepository,
  exportTodayContext,
  KnowledgeRepository,
  MemoryRepository,
  openOrbitDatabase,
  reindexLocalDataWithProvider,
  RecommendationRepository,
  SettingsRepository,
  SourceRepository,
  reviewKnowledgeArtifact,
  reviewMemory,
  reviewRecommendation,
  writeOrbitRuntimeConfig
} from "@orbit/db";
import { safeStorage } from "electron";
import type {
  KnowledgeReviewAction,
  MemoryReviewAction,
  RecommendationReviewAction
} from "@orbit/db";
import { isAbsolute, join, resolve } from "node:path";
import type {
  DesktopActionResult,
  DesktopAIProviderTestConfig,
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
  sourceSetupCompleted: "sources.setupCompleted"
} as const;

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
      settings: readSettings(settingsRepository)
    };
  } finally {
    database.close();
  }
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
    const adapters = buildSourceSetupAdapters(kind, path);
    const results = [];
    for (const adapter of adapters) {
      sourceRepository.upsertFromAdapter(adapter);
      const cursor = sourceRepository.getCursor(adapter.id);
      const result = await ingestEventsFromAdapter(adapter, eventRepository, cursor);
      sourceRepository.setCursor(adapter.id, result.nextCursor);
      results.push(result);
    }
    const pipeline = (
      await reindexLocalDataWithProvider(
        database,
        buildDesktopPipelineOptions(new SettingsRepository(database.db))
      )
    ).pipeline;
    new SettingsRepository(database.db).set(SETTING_KEYS.sourceSetupCompleted, true);
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

function readSettings(settings: SettingsRepository): DesktopSnapshot["settings"] {
  const configuredDatabasePath = settings.get<string>(SETTING_KEYS.configuredDatabasePath);
  const aiProvider = readAIProviderKind(settings.get<string>(SETTING_KEYS.aiProviderKind));
  const aiBaseUrl = settings.get<string>(SETTING_KEYS.aiBaseUrl);
  const aiModel = settings.get<string>(SETTING_KEYS.aiModel);
  const aiApiKeyCiphertext = settings.get<string>(SETTING_KEYS.aiApiKeyCiphertext);
  const snapshotSettings: DesktopSnapshot["settings"] = {
    localOnly: true,
    aiProvider,
    aiApiKeyConfigured: Boolean(aiApiKeyCiphertext),
    externalActionsEnabled: false,
    visualContextEnabled: false,
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

function readLanguageSetting(value: string | undefined): "system" | "en" | "zh-CN" {
  return value === "en" || value === "zh-CN" ? value : "system";
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

function readAIProviderKind(value: string | undefined): AIProviderKind {
  if (value === "mock" || value === "openai-compatible") return value;
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
  const apiKey =
    readOptionalString(input.apiKey) ??
    decryptApiKey(settings.get<string>(SETTING_KEYS.aiApiKeyCiphertext));
  if (baseUrl) config.baseUrl = baseUrl;
  if (model) config.model = model;
  if (apiKey) config.apiKey = apiKey;
  return config;
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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

function resolveInputPath(input: string): string {
  return isAbsolute(input) ? input : resolve(process.env.INIT_CWD ?? process.cwd(), input);
}
