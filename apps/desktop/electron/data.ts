import { buildTodayContext } from "@orbit/core";
import { ingestEventsFromAdapter } from "@orbit/core";
import { CodexAdapter, FixtureAdapter, LocalAgentAdapter, SeaTalkAdapter } from "@orbit/adapters";
import {
  ActivityRepository,
  clearLocalData,
  EventRepository,
  exportTodayContext,
  KnowledgeRepository,
  MemoryRepository,
  openOrbitDatabase,
  reindexLocalData,
  RecommendationRepository,
  SettingsRepository,
  SourceRepository,
  reviewKnowledgeArtifact,
  reviewMemory,
  reviewRecommendation,
  writeOrbitRuntimeConfig
} from "@orbit/db";
import type {
  KnowledgeReviewAction,
  MemoryReviewAction,
  RecommendationReviewAction
} from "@orbit/db";
import { isAbsolute, join, resolve } from "node:path";
import type {
  DesktopActionResult,
  DesktopSettingKey,
  DesktopSnapshot,
  SourceSetupKind
} from "../src/orbitApi";

const SETTING_KEYS = {
  menuBarEnabled: "desktop.menuBarEnabled",
  launchAtLoginEnabled: "desktop.launchAtLoginEnabled",
  language: "desktop.language",
  configuredDatabasePath: "storage.configuredDatabasePath",
  sourceSetupCompleted: "sources.setupCompleted"
} as const;

export function readDesktopSnapshot(date = new Date().toISOString().slice(0, 10)): DesktopSnapshot {
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
    const pipeline = reindexLocalData(database).pipeline;
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

export function reindexForDesktop(): DesktopActionResult {
  const database = openOrbitDatabase();
  try {
    const result = reindexLocalData(database);
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

function readSettings(settings: SettingsRepository): DesktopSnapshot["settings"] {
  const configuredDatabasePath = settings.get<string>(SETTING_KEYS.configuredDatabasePath);
  const snapshotSettings: DesktopSnapshot["settings"] = {
    localOnly: true,
    aiProvider: "mock_provider",
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
  return snapshotSettings;
}

function readLanguageSetting(value: string | undefined): "system" | "en" | "zh-CN" {
  return value === "en" || value === "zh-CN" ? value : "system";
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
