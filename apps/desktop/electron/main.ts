import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage } from "electron";
import { join } from "node:path";
import {
  captureScreenOcrBurstForDesktop,
  captureScreenOcrForDesktop,
  cleanupLegacyEventPrivacyForDesktop,
  cleanupPerceptionSidecarsForDesktop,
  clearLocalDataForDesktop,
  deleteSourceForDesktop,
  editKnowledgeForDesktop,
  editMemoryForDesktop,
  exportContextForDesktop,
  generateHandoffForDesktop,
  getActivitySessionDetailForDesktop,
  getKnowledgeArtifactDetailForDesktop,
  getMemoryDetailForDesktop,
  getRecommendationDetailForDesktop,
  readDesktopSnapshot,
  readDesktopSettings,
  reconfigureSourceForDesktop,
  reindexForDesktop,
  resetSourceCursorForDesktop,
  reviewKnowledgeForDesktop,
  reviewMemoryForDesktop,
  reviewRecommendationForDesktop,
  updatePerceptionProviderRouteForDesktop,
  updatePerceptionSamplingPresetForDesktop,
  updatePerceptionSourcePolicyForDesktop,
  updatePerceptionSourceRuntimeForDesktop,
  runBackgroundIngestionForDesktop,
  setCollectionPausedForDesktop,
  searchKnowledgeForDesktop,
  searchMemoryForDesktop,
  setupSourceForDesktop,
  syncDogfoodRuntimePermissionForDesktop,
  testAIProviderForDesktop,
  ignoreCurrentContextForDesktop,
  upsertProtectedRuleForDesktop,
  updateSourceRuntimeForDesktop,
  updateSettingForDesktop
} from "./data";
import {
  readPerceptionProviderKind,
  readPerceptionProviderTask,
  readPerceptionSourceKind
} from "@orbit/db";
import type { PerceptionSamplingPresetName } from "@orbit/core";
import type { DesktopLanguage, DesktopSnapshot } from "../src/orbitApi";
import type { DesktopIgnoreCurrentContextInput, DesktopProtectedRuleInput } from "../src/orbitApi";
import { DesktopObservationService } from "./observation/observationService";
import { detectScreenRecordingPermissionStatus } from "./observation/permissionStatus";

const currentDir = __dirname;
const backgroundIngestionIntervalMs = 60_000;
let mainWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
let backgroundIngestionTimer: NodeJS.Timeout | undefined;
let backgroundIngestionRunning = false;
const observationService = new DesktopObservationService({ notifyChanged: notifySnapshotChanged });

async function createMainWindow(): Promise<BrowserWindow> {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    return mainWindow;
  }

  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1040,
    minHeight: 680,
    title: "Orbit",
    titleBarStyle: "hiddenInset",
    backgroundColor: "#f8f7f4",
    webPreferences: {
      preload: join(currentDir, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow = window;
  window.on("closed", () => {
    mainWindow = undefined;
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    await window.loadURL(devServerUrl);
    return window;
  }

  await window.loadFile(join(currentDir, "../dist-renderer/index.html"));
  return window;
}

ipcMain.handle("orbit:getSnapshot", () => readDesktopSnapshot());
ipcMain.handle("orbit:getActivitySessionDetail", (_event, id: string) =>
  getActivitySessionDetailForDesktop(id)
);
ipcMain.handle("orbit:searchKnowledge", (_event, query: string, filters = {}) =>
  searchKnowledgeForDesktop(String(query ?? ""), filters)
);
ipcMain.handle("orbit:getKnowledgeArtifactDetail", (_event, id: string) =>
  getKnowledgeArtifactDetailForDesktop(id)
);
ipcMain.handle("orbit:editKnowledge", (_event, id: string, patch) =>
  editKnowledgeForDesktop(id, patch)
);
ipcMain.handle("orbit:reviewKnowledge", (_event, id: string, action: string) =>
  reviewKnowledgeForDesktop(id, requireKnowledgeAction(action))
);
ipcMain.handle("orbit:searchMemory", (_event, query: string, filters = {}) =>
  searchMemoryForDesktop(String(query ?? ""), filters)
);
ipcMain.handle("orbit:getMemoryDetail", (_event, id: string) => getMemoryDetailForDesktop(id));
ipcMain.handle("orbit:editMemory", (_event, id: string, patch) => editMemoryForDesktop(id, patch));
ipcMain.handle("orbit:reviewMemory", (_event, id: string, action: string) =>
  reviewMemoryForDesktop(id, requireMemoryAction(action))
);
ipcMain.handle("orbit:getRecommendationDetail", (_event, id: string) =>
  getRecommendationDetailForDesktop(id)
);
ipcMain.handle(
  "orbit:reviewRecommendation",
  (_event, id: string, action: string, options?: { snoozeUntil?: string | undefined }) =>
    reviewRecommendationForDesktop(id, requireRecommendationAction(action), options)
);
ipcMain.handle("orbit:updateSetting", (_event, key: string, value: unknown) => {
  const snapshot = updateSettingForDesktop(requireSettingKey(key), value);
  applyRuntimeSettings();
  return snapshot;
});
ipcMain.handle("orbit:setCollectionPaused", async (_event, paused: boolean) => {
  let snapshot = setCollectionPausedForDesktop(Boolean(paused));
  applyRuntimeSettings();
  if (!paused) {
    await runBackgroundIngestionTick();
    snapshot = readDesktopSnapshot();
  }
  return snapshot;
});
ipcMain.handle("orbit:updateSourceRuntime", async (_event, sourceId: string, action: string) => {
  let snapshot = updateSourceRuntimeForDesktop(sourceId, requireSourceRuntimeAction(action));
  applyRuntimeSettings();
  if (action === "resume" || action === "enable") {
    await runBackgroundIngestionTick();
    snapshot = readDesktopSnapshot();
  }
  return snapshot;
});
ipcMain.handle(
  "orbit:updatePerceptionSourceRuntime",
  (_event, sourceKind: string, action: string) =>
    updatePerceptionSourceRuntimeForDesktop(
      readPerceptionSourceKind(sourceKind),
      requirePerceptionRuntimeAction(action)
    )
);
ipcMain.handle("orbit:updatePerceptionSourcePolicy", (_event, sourceKind: string, patch) =>
  updatePerceptionSourcePolicyForDesktop(readPerceptionSourceKind(sourceKind), patch)
);
ipcMain.handle("orbit:updatePerceptionProviderRoute", (_event, task: string, provider: string) =>
  updatePerceptionProviderRouteForDesktop(
    readPerceptionProviderTask(task),
    readPerceptionProviderKind(provider)
  )
);
ipcMain.handle("orbit:updatePerceptionSamplingPreset", (_event, preset: string) =>
  updatePerceptionSamplingPresetForDesktop(requireSamplingPreset(preset))
);
ipcMain.handle("orbit:upsertProtectedRule", (_event, input: DesktopProtectedRuleInput) => {
  const snapshot = upsertProtectedRuleForDesktop(input);
  applyRuntimeSettings();
  return snapshot;
});
ipcMain.handle("orbit:ignoreCurrentContext", (_event, input: DesktopIgnoreCurrentContextInput) => {
  const snapshot = ignoreCurrentContextForDesktop(input);
  applyRuntimeSettings();
  return snapshot;
});
ipcMain.handle("orbit:setupSource", (_event, kind: string, path?: string) =>
  setupSourceForDesktop(requireSourceSetupKind(kind), path)
);
ipcMain.handle("orbit:reconfigureSource", (_event, sourceId: string, kind: string, path?: string) =>
  reconfigureSourceForDesktop(sourceId, requireSourceSetupKind(kind), path)
);
ipcMain.handle("orbit:deleteSource", (_event, sourceId: string) =>
  deleteSourceForDesktop(sourceId)
);
ipcMain.handle("orbit:resetSourceCursor", (_event, sourceId: string) =>
  resetSourceCursorForDesktop(sourceId)
);
ipcMain.handle("orbit:cleanupLegacyEventPrivacy", () => cleanupLegacyEventPrivacyForDesktop());
ipcMain.handle("orbit:cleanupPerceptionSidecars", () => cleanupPerceptionSidecarsForDesktop());
ipcMain.handle("orbit:captureScreenOcr", async () => {
  const result = await captureScreenOcrForDesktop();
  applyRuntimeSettings();
  notifySnapshotChanged();
  return result;
});
ipcMain.handle("orbit:captureScreenOcrBurst", async () => {
  const result = await captureScreenOcrBurstForDesktop();
  applyRuntimeSettings();
  notifySnapshotChanged();
  return result;
});
ipcMain.handle("orbit:generateHandoff", (_event, input) => generateHandoffForDesktop(input));
ipcMain.handle("orbit:reindexLocalData", () => reindexForDesktop());
ipcMain.handle("orbit:clearLocalData", () => clearLocalDataForDesktop());
ipcMain.handle("orbit:exportContext", () => exportContextForDesktop());
ipcMain.handle("orbit:testAIProvider", (_event, config) => testAIProviderForDesktop(config));
ipcMain.handle("orbit:startObservation", async () => {
  await observationService.start();
  applyRuntimeSettings();
  return readDesktopSnapshot();
});
ipcMain.handle("orbit:pauseObservation", () => {
  observationService.pause();
  applyRuntimeSettings();
  return readDesktopSnapshot();
});
ipcMain.handle("orbit:resumeObservation", async () => {
  await observationService.resume();
  applyRuntimeSettings();
  return readDesktopSnapshot();
});
ipcMain.handle("orbit:stopObservation", () => {
  observationService.stop();
  applyRuntimeSettings();
  return readDesktopSnapshot();
});

app.whenReady().then(async () => {
  applyRuntimeSettings();
  const window = await createMainWindow();
  syncDogfoodRuntimeFromSystemPermission();
  await observationService.restoreFromSettings();
  if (process.env.ORBIT_PACKAGED_SMOKE === "1") {
    void runPackagedSmoke(window);
  } else if (process.env.ORBIT_E2E_RENDERER_SMOKE === "1") {
    void runRendererSmoke(window);
  } else {
    startBackgroundIngestion();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

function applyRuntimeSettings(): void {
  const settings = readDesktopSettings();
  if (process.env.ORBIT_SKIP_LOGIN_ITEM_SETTINGS !== "1") {
    try {
      app.setLoginItemSettings({ openAtLogin: settings.launchAtLoginEnabled });
    } catch (error) {
      console.warn(
        `Orbit could not update login item settings: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
  if (settings.menuBarEnabled) {
    ensureTray();
  } else {
    tray?.destroy();
    tray = undefined;
  }
}

function ensureTray(): void {
  if (!tray) {
    const image = nativeImage.createEmpty();
    tray = new Tray(image);
    if (process.platform === "darwin") {
      tray.setTitle("Orbit");
    }
  }
  const snapshot = readDesktopSnapshot();
  const runtime = snapshot.runtime;
  const observation = snapshot.observation;
  const dogfoodRuntime = snapshot.perception.dogfoodRuntime;
  const runtimeLocale = readDesktopRuntimeLocale(snapshot.settings.language);
  const paused = runtime.collectionPaused;
  const status = runtime.status;
  const activeSources = snapshot.sources
    .filter((source) => source.enabled && !source.paused)
    .map((source) => source.displayName);
  const lastEventAt = observation.lastEventAt ?? snapshot.sources.find((source) => source.lastEventAt)?.lastEventAt;
  tray.setToolTip(
    [
      `Orbit: ${runtimeLocale.runtimeStatus(status)}`,
      `${runtimeLocale.tray.observation}: ${runtimeLocale.observationStatus(observation.status)}`,
      `${runtimeLocale.tray.screenOcr}: ${runtimeLocale.dogfoodRuntimeState(dogfoodRuntime.state)}`,
      `${runtimeLocale.tray.lastEvent}: ${lastEventAt ?? runtimeLocale.tray.none}`,
      `${runtimeLocale.tray.sources}: ${activeSources.length > 0 ? activeSources.join(", ") : runtimeLocale.tray.none}`
    ].join("; ")
  );
  if (process.platform === "darwin") {
    tray.setTitle(paused ? runtimeLocale.tray.orbitPaused : "Orbit");
  }
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: runtimeLocale.tray.showOrbit,
        click: () => {
          void createMainWindow();
        }
      },
      {
        label: paused ? runtimeLocale.tray.resumeCollection : runtimeLocale.tray.pauseCollection,
        click: () => {
          void handleTrayPauseToggle(!paused);
        }
      },
      { type: "separator" },
      {
        label:
          observation.enabled && observation.paused
            ? runtimeLocale.tray.resumeObservation
            : observation.enabled
              ? runtimeLocale.tray.pauseObservation
              : runtimeLocale.tray.startObservation,
        click: () => {
          void handleTrayObservationToggle();
        }
      },
      {
        label: runtimeLocale.tray.stopObservation,
        enabled: observation.enabled,
        click: () => {
          observationService.stop();
          applyRuntimeSettings();
        }
      },
      {
        label: `${runtimeLocale.tray.screenOcr}: ${runtimeLocale.dogfoodRuntimeState(dogfoodRuntime.state)}`,
        enabled: false
      },
      {
        label:
          dogfoodRuntime.state === "paused_user" || dogfoodRuntime.state === "stopped"
            ? runtimeLocale.tray.resumeScreenOcr
            : runtimeLocale.tray.pauseScreenOcr,
        click: () => {
          void handleTrayScreenOcrToggle();
        }
      },
      {
        label: runtimeLocale.tray.ignoreCurrentAppWindow,
        enabled: false,
        toolTip: runtimeLocale.tray.ignoreCurrentAppWindowUnavailable
      },
      {
        label: runtimeLocale.tray.stopScreenOcr,
        enabled: dogfoodRuntime.state !== "stopped",
        click: () => {
          updatePerceptionSourceRuntimeForDesktop("screen", "disable");
          updatePerceptionSourceRuntimeForDesktop("ocr", "disable");
          applyRuntimeSettings();
          notifySnapshotChanged();
        }
      },
      {
        label: runtimeLocale.tray.captureScreenOcrNow,
        enabled: dogfoodRuntime.state === "observing",
        click: async () => {
          await captureScreenOcrBurstForDesktop();
          applyRuntimeSettings();
          notifySnapshotChanged();
        }
      },
      {
        label: `${runtimeLocale.tray.status}: ${runtimeLocale.runtimeStatus(status)}; ${runtimeLocale.tray.observation}: ${runtimeLocale.observationStatus(observation.status)}`,
        enabled: false
      },
      { type: "separator" },
      {
        label: runtimeLocale.tray.openActivity,
        click: () => {
          void navigateMainWindow("activity");
        }
      },
      {
        label: runtimeLocale.tray.openSettings,
        click: () => {
          void navigateMainWindow("settings");
        }
      },
      {
        label: runtimeLocale.tray.cleanupPrivacy,
        click: () => {
          cleanupPerceptionSidecarsForDesktop();
          applyRuntimeSettings();
          notifySnapshotChanged();
        }
      },
      {
        label: runtimeLocale.tray.quit,
        click: () => app.quit()
      }
    ])
  );
}

function syncDogfoodRuntimeFromSystemPermission(): void {
  const permission = detectScreenRecordingPermissionStatus();
  syncDogfoodRuntimePermissionForDesktop(permission.status);
}

async function handleTrayScreenOcrToggle(): Promise<void> {
  const dogfoodRuntime = readDesktopSnapshot().perception.dogfoodRuntime;
  if (dogfoodRuntime.state === "paused_user" || dogfoodRuntime.state === "stopped") {
    updatePerceptionSourceRuntimeForDesktop("screen", "resume");
    updatePerceptionSourceRuntimeForDesktop("ocr", "resume");
  } else {
    updatePerceptionSourceRuntimeForDesktop("screen", "pause");
    updatePerceptionSourceRuntimeForDesktop("ocr", "pause");
  }
  applyRuntimeSettings();
  notifySnapshotChanged();
}

async function handleTrayObservationToggle(): Promise<void> {
  const observation = readDesktopSnapshot().observation;
  if (!observation.enabled) {
    await observationService.start();
  } else if (observation.paused) {
    await observationService.resume();
  } else {
    observationService.pause();
  }
  applyRuntimeSettings();
}

async function handleTrayPauseToggle(paused: boolean): Promise<void> {
  setCollectionPausedForDesktop(paused);
  applyRuntimeSettings();
  if (!paused) {
    await runBackgroundIngestionTick();
  }
}

function startBackgroundIngestion(): void {
  if (backgroundIngestionTimer) return;
  void runBackgroundIngestionTick();
  backgroundIngestionTimer = setInterval(() => {
    void runBackgroundIngestionTick();
  }, backgroundIngestionIntervalMs);
}

async function runBackgroundIngestionTick(): Promise<void> {
  if (backgroundIngestionRunning) return;
  backgroundIngestionRunning = true;
  try {
    await runBackgroundIngestionForDesktop();
  } finally {
    backgroundIngestionRunning = false;
    applyRuntimeSettings();
    notifySnapshotChanged();
  }
}

function notifySnapshotChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("orbit:snapshotChanged");
  }
}

async function navigateMainWindow(page: "activity" | "settings"): Promise<void> {
  const window = await createMainWindow();
  window.webContents.send("orbit:navigate", page);
}

async function runRendererSmoke(window: BrowserWindow): Promise<void> {
  try {
    await setupSourceForDesktop("fixtures");
    const firstArtifact = readDesktopSnapshot().knowledgeArtifacts[0];
    if (firstArtifact) {
      reviewKnowledgeForDesktop(firstArtifact.id, "confirm");
    }
    notifySnapshotChanged();
    await window.webContents.executeJavaScript(
      `
        (async () => {
          const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
          const waitFor = async (selector) => {
            for (let index = 0; index < 120; index += 1) {
              const element = document.querySelector(selector);
              if (element) return element;
              await sleep(100);
            }
            throw new Error("Missing selector: " + selector);
          };
          const click = async (selector) => {
            const element = await waitFor(selector);
            element.click();
            await sleep(150);
          };
          const assertScrollable = async (selector) => {
            const element = await waitFor(selector);
            if (element.scrollHeight <= element.clientHeight) {
              throw new Error(
                "Expected scrollable selector: " +
                  selector +
                  " scrollHeight=" +
                  element.scrollHeight +
                  " clientHeight=" +
                  element.clientHeight
              );
            }
          };
          const pageIds = [
            "today",
            "activity",
            "knowledge",
            "memory",
            "recommendations",
            "handoff",
            "review",
            "sources",
            "settings"
          ];
          for (const pageId of pageIds) {
            await click('[data-page-id="' + pageId + '"]');
            await waitFor('[data-page-id="' + pageId + '"].active');
          }
          await click('[data-page-id="handoff"]');
          await click('[data-handoff-action="generate-today"]');
          await waitFor(".handoff-preview");
          await waitFor(".handoff-excluded-list");
          await click('[data-page-id="settings"]');
          await waitFor(".provider-boundary");
          await assertScrollable(".settings-content");
          await click('[data-settings-section-id="privacy"]');
          await waitFor(".privacy-settings-panel");
          await click('[data-settings-section-id="runtime"]');
          await waitFor(".observation-settings-panel");
          await waitFor(".screen-ocr-runtime-panel");
          await click('[data-observation-action="start"]');
          await sleep(1200);
          await click('[data-observation-action="stop"]');
          await click('[data-settings-section-id="indexing"]');
          await waitFor(".index-settings-panel");
          await click('[data-page-id="knowledge"]');
          const artifact = await waitFor(".knowledge-list-item");
          artifact.click();
          await waitFor(".knowledge-detail-pane .detail-header");
          await waitFor(".markdown-preview");
          await click('[data-page-id="memory"]');
          const memory = await waitFor(".memory-list-item");
          memory.click();
          await waitFor(".memory-detail-pane .detail-header");
          await waitFor(".memory-detail-pane .detail-grid");
          await click('[data-page-id="recommendations"]');
          const recommendation = await waitFor(".recommendation-list-item");
          recommendation.click();
          await waitFor(".recommendation-detail-pane .detail-header");
          await waitFor(".snooze-control");
          await click('[data-page-id="activity"]');
          const session = await waitFor(".activity-timeline-item");
          session.click();
          await waitFor(".activity-playback-header");
          await waitFor(".mini-grid");
          await waitFor(".event-stream .event-row");
          await waitFor(".derived-grid");
          return true;
        })()
      `,
      true
    );
    app.exit(0);
  } catch (error) {
    console.error(
      `Orbit renderer smoke failed: ${error instanceof Error ? error.message : String(error)}`
    );
    app.exit(1);
  }
}

async function runPackagedSmoke(window: BrowserWindow): Promise<void> {
  try {
    await window.webContents.executeJavaScript(
      `
        (async () => {
          const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
          for (let index = 0; index < 120; index += 1) {
            if (window.orbit) break;
            await sleep(100);
          }
          if (!window.orbit) {
            throw new Error("Missing window.orbit preload API");
          }
          const snapshot = await window.orbit.getSnapshot();
          const expectedHome = ${JSON.stringify(process.env.ORBIT_HOME ?? "")};
          if (!expectedHome || snapshot.orbitHome !== expectedHome) {
            throw new Error(
              "Packaged smoke used unexpected ORBIT_HOME: " + snapshot.orbitHome
            );
          }
          if (!document.querySelector('[data-page-id="today"]')) {
            throw new Error("Packaged smoke missing navigation");
          }
          if (snapshot.sources.length !== 0) {
            throw new Error("Packaged smoke found default sources on first launch");
          }
          if (Object.keys(snapshot.sourceAdapterConfigs).length !== 0) {
            throw new Error("Packaged smoke found default source adapter configs");
          }
          document.querySelector('[data-page-id="settings"]')?.click();
          for (let index = 0; index < 50; index += 1) {
            if (document.querySelector('[data-settings-section-id="runtime"]')) break;
            await sleep(100);
          }
          document.querySelector('[data-settings-section-id="runtime"]')?.click();
          for (let index = 0; index < 50; index += 1) {
            if (document.body.textContent?.includes(expectedHome)) return true;
            await sleep(100);
          }
          throw new Error("Packaged smoke could not verify visible Settings runtime ORBIT_HOME");
        })()
      `,
      true
    );
    console.log("ORBIT_PACKAGED_SMOKE_OK");
    app.exit(0);
  } catch (error) {
    console.error(
      `Orbit packaged smoke failed: ${error instanceof Error ? error.message : String(error)}`
    );
    app.exit(1);
  }
}

function requireKnowledgeAction(action: string): "confirm" | "reject" | "archive" {
  if (action === "confirm" || action === "reject" || action === "archive") return action;
  throw new Error(`Unsupported knowledge action: ${action}`);
}

function requireMemoryAction(action: string): "confirm" | "reject" | "archive" {
  if (action === "confirm" || action === "reject" || action === "archive") return action;
  throw new Error(`Unsupported memory action: ${action}`);
}

function requireRecommendationAction(action: string): "accept" | "dismiss" | "snooze" | "resolve" {
  if (action === "accept" || action === "dismiss" || action === "snooze" || action === "resolve") {
    return action;
  }
  throw new Error(`Unsupported recommendation action: ${action}`);
}

function requireSettingKey(
  key: string
):
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
  | "sources.setupCompleted" {
  if (
    key === "desktop.menuBarEnabled" ||
    key === "desktop.launchAtLoginEnabled" ||
    key === "desktop.language" ||
    key === "storage.configuredDatabasePath" ||
    key === "ai.providerKind" ||
    key === "ai.baseUrl" ||
    key === "ai.model" ||
    key === "ai.apiKey" ||
    key === "ai.maxTokens" ||
    key === "ai.testMaxTokens" ||
    key === "ai.tokenLimitParameter" ||
    key === "sources.setupCompleted"
  ) {
    return key;
  }
  throw new Error(`Unsupported setting key: ${key}`);
}

function requireSourceSetupKind(kind: string): "fixtures" | "codex" | "local_agent" | "seatalk" {
  if (kind === "fixtures" || kind === "codex" || kind === "local_agent" || kind === "seatalk") {
    return kind;
  }
  throw new Error(`Unsupported source setup kind: ${kind}`);
}

function requireSourceRuntimeAction(action: string): "pause" | "resume" | "enable" | "disable" {
  if (action === "pause" || action === "resume" || action === "enable" || action === "disable") {
    return action;
  }
  throw new Error(`Unsupported source runtime action: ${action}`);
}

function requirePerceptionRuntimeAction(
  action: string
): "enable" | "disable" | "pause" | "resume" | "delete" {
  if (
    action === "enable" ||
    action === "disable" ||
    action === "pause" ||
    action === "resume" ||
    action === "delete"
  ) {
    return action;
  }
  throw new Error(`Unsupported perception runtime action: ${action}`);
}

function requireSamplingPreset(value: string): PerceptionSamplingPresetName {
  if (value === "conservative" || value === "balanced" || value === "intensive") return value;
  throw new Error(`Unsupported perception sampling preset: ${value}`);
}

function readDesktopRuntimeLocale(language: DesktopLanguage) {
  const zh = language === "zh-CN";
  const tray = zh
    ? {
        observation: "观察",
        screenOcr: "屏幕 / OCR",
        lastEvent: "最近事件",
        sources: "来源",
        none: "无",
        orbitPaused: "Orbit 已暂停",
        showOrbit: "显示 Orbit",
        resumeCollection: "恢复后台采集",
        pauseCollection: "暂停后台采集",
        startObservation: "启动观察",
        resumeObservation: "恢复观察",
        pauseObservation: "暂停观察",
        stopObservation: "停止观察",
        resumeScreenOcr: "恢复屏幕 / OCR",
        pauseScreenOcr: "暂停屏幕 / OCR",
        ignoreCurrentAppWindow: "忽略当前应用/窗口",
        ignoreCurrentAppWindowUnavailable: "当前没有可用的前台应用/窗口元数据",
        stopScreenOcr: "停止屏幕 / OCR",
        captureScreenOcrNow: "立即捕获屏幕 / OCR burst",
        openActivity: "打开活动",
        openSettings: "打开设置",
        cleanupPrivacy: "清理感知 Sidecar",
        status: "状态",
        quit: "退出"
      }
    : {
        observation: "Observation",
        screenOcr: "Screen/OCR",
        lastEvent: "Last event",
        sources: "Sources",
        none: "none",
        orbitPaused: "Orbit Paused",
        showOrbit: "Show Orbit",
        resumeCollection: "Resume Collection",
        pauseCollection: "Pause Collection",
        startObservation: "Start Observation",
        resumeObservation: "Resume Observation",
        pauseObservation: "Pause Observation",
        stopObservation: "Stop Observation",
        resumeScreenOcr: "Resume Screen/OCR",
        pauseScreenOcr: "Pause Screen/OCR",
        ignoreCurrentAppWindow: "Ignore Current App/Window",
        ignoreCurrentAppWindowUnavailable: "No foreground app/window metadata is available",
        stopScreenOcr: "Stop Screen/OCR",
        captureScreenOcrNow: "Capture Screen/OCR Burst Now",
        openActivity: "Open Activity",
        openSettings: "Open Settings",
        cleanupPrivacy: "Clean Perception Sidecars",
        status: "Status",
        quit: "Quit"
      };
  return {
    tray,
    runtimeStatus(status: DesktopSnapshot["runtime"]["status"]): string {
      if (status === "collecting") return zh ? "采集中" : "collecting";
      if (status === "paused") return zh ? "已暂停" : "paused";
      if (status === "error") return zh ? "错误" : "error";
      return zh ? "空闲" : "idle";
    },
    observationStatus(status: DesktopSnapshot["observation"]["status"]): string {
      if (status === "needs_permission") return zh ? "需要权限" : "needs permission";
      if (status === "ready") return zh ? "就绪" : "ready";
      if (status === "collecting") return zh ? "观察中" : "collecting";
      if (status === "paused") return zh ? "已暂停" : "paused";
      if (status === "warning") return zh ? "警告" : "warning";
      if (status === "error") return zh ? "错误" : "error";
      if (status === "disabled") return zh ? "已禁用" : "disabled";
      return zh ? "未配置" : "not configured";
    },
    dogfoodRuntimeState(state: DesktopSnapshot["perception"]["dogfoodRuntime"]["state"]): string {
      const labels = zh
        ? {
            needs_permission: "需要权限",
            observing: "观察中",
            paused_user: "用户暂停",
            paused_resource: "资源暂停",
            protected: "受保护上下文",
            stopped: "已停止",
            error: "错误"
          }
        : {
            needs_permission: "Permission needed",
            observing: "Observing",
            paused_user: "Paused",
            paused_resource: "Resource paused",
            protected: "Protected",
            stopped: "Stopped",
            error: "Error"
          };
      return labels[state];
    }
  };
}
